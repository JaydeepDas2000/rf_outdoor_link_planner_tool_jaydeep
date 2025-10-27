// --- Constants and State ---
const SPEED_OF_LIGHT = 3e8;
const linkPlanner = {
    towers: [],
    links: [],
    activeLinkPhase: null,
    selectedLink: null,
    nextId: 1
};

// --- Map Setup ---
const map = L.map('map').setView([13.027, 77.545], 15); // Office Location Bangalore, India
let currentTileLayer;

const TILE_CONFIGS = {
    'standard': { 
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
        attribution: '© OpenStreetMap contributors' 
    },
    'bw': { 
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', 
        attribution: '© CartoDB, © OpenStreetMap contributors' 
    },
    'terrain': { 
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', 
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)' 
    }
};

/**
 * Changes the base tile layer of the map.
 * @param {string} styleKey - Key from TILE_CONFIGS ('standard', 'bw', 'terrain').
 */
function changeTileLayer(styleKey) {
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }
    const config = TILE_CONFIGS[styleKey];
    currentTileLayer = L.tileLayer(config.url, {
        maxZoom: 19,
        attribution: config.attribution,
        ubdomains: ['a', 'b', 'c', 'd']
    }).addTo(map);
}

// Set initial map style to Black & White
changeTileLayer('bw');


// --- Fresnel Zone Calculation ---
/**
 * Calculates the max radius of the first Fresnel zone at the midpoint.
 * @param {number} frequencyHz - Signal frequency in Hertz (Hz).
 * @param {number} distanceMeters - Total link distance in meters (D).
 * @returns {number} The max Fresnel radius (r_max) in meters.
 */
function calculateMaxFresnelRadius(frequencyHz, distanceMeters) {
    if (frequencyHz <= 0 || distanceMeters <= 0) return 0;
    
    // Wavelength (λ) = c / f
    const wavelength = SPEED_OF_LIGHT / frequencyHz;
    
    // r_max = sqrt( (λ * (D/2) * (D/2)) / D ) = sqrt( (λ * D) / 4 )
    const rSquared = (wavelength * distanceMeters) / 4;
    return Math.sqrt(rSquared);
}

// --- Tower & Link Management Functions ---

/**
 * Handles the logic for placing a new tower on the map.
 * @param {L.LatLng} latlng - The coordinates of the new tower.
 */
function addTower(latlng) {
    const id = `T${linkPlanner.nextId++}`;
    const defaultFreq = 5.8; // Default to 5.8 GHz common in outdoor links

    // Custom HTML marker for clickability and styling
    const customIcon = L.divIcon({
        className: 'tower-marker',
        iconAnchor: [6, 6]
    });

    const marker = L.marker(latlng, { icon: customIcon }).addTo(map);

    const newTower = {
        id,
        latlng: [latlng.lat, latlng.lng],
        frequencyGHz: defaultFreq,
        marker
    };

    marker.on('click', () => handleTowerClick(newTower));

    linkPlanner.towers.push(newTower);
    updateTowerListUI();
}

/**
 * Handles the state logic when a user clicks a tower (either to edit or start/end a link).
 * @param {object} tower - The tower object.
 */
function handleTowerClick(tower) {
    // 1. Tower Configuration / Editing 
    const newFreq = prompt(`Edit Tower ${tower.id} Frequency (GHz). Current: ${tower.frequencyGHz} GHz`, tower.frequencyGHz);
    if (newFreq !== null) {
        const freq = parseFloat(newFreq);
        if (!isNaN(freq) && freq > 0) {
            tower.frequencyGHz = freq;
            updateTowerListUI();
        } else {
            console.error("Invalid frequency entered.");
        }
    }
    
    // 2. Link Creation Logic
    const currentMarkerElement = tower.marker.getElement();
    if (linkPlanner.activeLinkPhase === null) {
        // Start of a new link
        linkPlanner.activeLinkPhase = tower.id;
        currentMarkerElement.style.borderColor = 'yellow'; // Highlight first tower
    } else if (linkPlanner.activeLinkPhase === tower.id) {
        // Clicked the same tower twice: cancel
        linkPlanner.activeLinkPhase = null;
        currentMarkerElement.style.borderColor = 'white';
    } else {
        // End of a new link
        const towerA = linkPlanner.towers.find(t => t.id === linkPlanner.activeLinkPhase);
        const towerB = tower;

        if (towerA.frequencyGHz === towerB.frequencyGHz) {
            createLink(towerA, towerB);
        } else {
            console.warn(`Frequencies mismatch! ${towerA.id}: ${towerA.frequencyGHz} GHz vs ${towerB.id}: ${towerB.frequencyGHz} GHz.`);
        }

        // Reset phase and highlight
        towerA.marker.getElement().style.borderColor = 'white';
        linkPlanner.activeLinkPhase = null;
    }
}

/**
 * Creates and draws a new link between two towers.
 * @param {object} towerA - First tower object.
 * @param {object} towerB - Second tower object.
 */
function createLink(towerA, towerB) {
    const id = `L${linkPlanner.nextId++}`;
    
    const latlngs = [towerA.latlng, towerB.latlng];
    const linkLine = L.polyline(latlngs, {
        color: 'blue',
        weight: 3,
        className: 'leaflet-link-line'
    }).addTo(map);

    const newLink = {
        id,
        towerAId: towerA.id,
        towerBId: towerB.id,
        linkLine
    };
    
    // Handle link click to draw Fresnel Zone
    linkLine.on('click', (e) => handleLinkClick(newLink, e));
    
    linkPlanner.links.push(newLink);
    updateLinkListUI();
}

/**
 * Handles the logic when a link is clicked.
 * @param {object} link - The link object.
 * @param {L.MouseEvent} event - The Leaflet click event.
 */
function handleLinkClick(link, event) {
    // Deselect previous link
    if (linkPlanner.selectedLink) {
        linkPlanner.selectedLink.linkLine.setStyle({ className: 'leaflet-link-line' });
    }
    
    // Select new link and highlight
    linkPlanner.selectedLink = link;
    link.linkLine.setStyle({ className: 'leaflet-link-line-selected' });
    
    // Calculate and draw Fresnel Zone
    drawFresnelZone(link);
    
    // Prevent map click event from firing on top of the line
    L.DomEvent.stopPropagation(event); 
}

/**
 * Calculates and draws the first Fresnel zone ellipse.
 * @param {object} link - The link object containing tower IDs.
 */
function drawFresnelZone(link) {
    const towerA = linkPlanner.towers.find(t => t.id === link.towerAId);
    const towerB = linkPlanner.towers.find(t => t.id === link.towerBId);

    if (!towerA || !towerB) return;

    const latlngA = L.latLng(towerA.latlng);
    const latlngB = L.latLng(towerB.latlng);

    // 1. Calculate Core Parameters
    const distanceMeters = latlngA.distanceTo(latlngB); // Total link distance (D)
    const frequencyHz = towerA.frequencyGHz * 1e9; // Convert GHz to Hz
    const maxFresnelRadiusMeters = calculateMaxFresnelRadius(frequencyHz, distanceMeters);

    // 2. Find Center and Bearing (Angle)
    const centerLatlng = L.latLng(
        (latlngA.lat + latlngB.lat) / 2,
        (latlngA.lng + latlngB.lng) / 2
    );

    // Bearing calculation for rotation (North is 0 degrees, East is 90)
    const toRad = (deg) => deg * Math.PI / 180;
    const dLon = toRad(latlngB.lng - latlngA.lng);
    const latA = toRad(latlngA.lat);
    const latB = toRad(latlngB.lat);
    
    const y = Math.sin(dLon) * Math.cos(latB);
    const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLon);
    let bearingDeg = Math.atan2(y, x) * 180 / Math.PI;
    bearingDeg = (bearingDeg + 360) % 360; // Normalize to 0-360

    // 3. Draw/Update SVG Ellipse
    let svgOverlay = document.getElementById('fresnel-svg-overlay');
    if (!svgOverlay) {
        svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgOverlay.setAttribute('id', 'fresnel-svg-overlay');
        svgOverlay.setAttribute('class', 'fresnel-svg-overlay');
        // Append the SVG directly to the map container
        document.getElementById('map').appendChild(svgOverlay);
    }
    
    let ellipse = document.getElementById('fresnel-ellipse');
    if (!ellipse) {
        ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        ellipse.setAttribute('id', 'fresnel-ellipse');
        svgOverlay.appendChild(ellipse);
    }
    
    // Get pixel coordinates from Leaflet's projection
    const centerPoint = map.latLngToLayerPoint(centerLatlng);
    const pA = map.latLngToLayerPoint(latlngA);
    const pB = map.latLngToLayerPoint(latlngB);
    
    // --- Adjust coordinates for map pan offset ---
    // Leaflet's layer points are relative to a dynamic origin.
    // We must subtract the map's current pixel origin to make them relative to the SVG's top-left corner (0,0).
    const mapPaneOffset = map.getPixelOrigin(); 

    const cx = centerPoint.x - mapPaneOffset.x;
    const cy = centerPoint.y - mapPaneOffset.y;
    // ------------------------------------------

    const lengthPixels = pA.distanceTo(pB); // Link length in screen pixels
    
    // Approximate R_max in pixels based on the current map scale
    const metersPerPixel = distanceMeters / lengthPixels;
    const rMaxPixels = maxFresnelRadiusMeters / metersPerPixel;

    // Apply SVG Attributes
    ellipse.setAttribute('cx', cx);
    ellipse.setAttribute('cy', cy);
    ellipse.setAttribute('rx', lengthPixels / 2); // Major semi-axis (half link distance)
    ellipse.setAttribute('ry', rMaxPixels);       // Minor semi-axis (max Fresnel radius)
    
    // Rotate the ellipse around the offset-corrected center point.
    ellipse.setAttribute('transform', 
        `rotate(${bearingDeg - 90}, ${cx}, ${cy})` 
    );
    
    // Ensure the SVG is visible 
    svgOverlay.style.display = 'block'; 
}

// --- UI Update Functions ---

function updateTowerListUI() {
    const listDiv = document.getElementById('tower-list');
    listDiv.innerHTML = '';
    document.getElementById('tower-count').textContent = linkPlanner.towers.length;
    
    linkPlanner.towers.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tower-info';
        div.innerHTML = `<strong>${t.id}</strong> - ${t.frequencyGHz} GHz<br><small>Lat/Lng: ${t.latlng[0].toFixed(3)}, ${t.latlng[1].toFixed(3)}</small>`;
        div.onclick = () => handleTowerClick(t);
        listDiv.appendChild(div);
    });
}

function updateLinkListUI() {
    const listDiv = document.getElementById('link-list');
    listDiv.innerHTML = '';
    document.getElementById('link-count').textContent = linkPlanner.links.length;

    linkPlanner.links.forEach(l => {
        const towerA = linkPlanner.towers.find(t => t.id === l.towerAId);
        const towerB = linkPlanner.towers.find(t => t.id === l.towerBId);
        const distance = towerA && towerB ? L.latLng(towerA.latlng).distanceTo(L.latLng(towerB.latlng)) : 0;
        
        const div = document.createElement('div');
        div.className = 'link-info';
        div.innerHTML = `<strong>${l.id}</strong>: ${l.towerAId} <-> ${l.towerBId}<br><small>Dist: ${(distance/1000).toFixed(2)} km</small>`;
        div.onclick = (e) => handleLinkClick(l, e);
        listDiv.appendChild(div);
    });
}

// --- Event Listeners ---
map.on('click', (e) => {
    // Only add a tower if not in the middle of creating a link
    if (linkPlanner.activeLinkPhase === null) {
        addTower(e.latlng);
    } else {
        // If an active phase exists but user clicked empty map, cancel the phase
        const towerA = linkPlanner.towers.find(t => t.id === linkPlanner.activeLinkPhase);
        if (towerA) {
            towerA.marker.getElement().style.borderColor = 'white';
        }
        linkPlanner.activeLinkPhase = null;
    }
});

// Re-draw the SVG overlay when the map moves or zooms
map.on('moveend', () => {
    if (linkPlanner.selectedLink) {
        drawFresnelZone(linkPlanner.selectedLink);
    }
});

// --- Event Listeners for Tile Layers ---
document.getElementById('bw-btn').addEventListener('click', () => changeTileLayer('bw'));
document.getElementById('terrain-btn').addEventListener('click', () => changeTileLayer('terrain'));
document.getElementById('osm-btn').addEventListener('click', () => changeTileLayer('standard'));

// Initial UI render
updateTowerListUI();
updateLinkListUI();