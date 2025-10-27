## Live: https://jaydeepdas2000.github.io/rf_outdoor_link_planner_tool_jaydeep/index.html

Design and Approach Overview
----------------------------

### 1\. Technology Stack and Architecture

*   **Single-File Mandate (Portability):** The entire application (HTML, CSS, and JavaScript) is contained within a single index.html file. This design choice makes the application extremely easy to deploy on static hosting services (like GitHub Pages) without needing a build system or server-side code.
    
*   **Mapping Library:** **Leaflet.js** is used for interactive map rendering. It is a lightweight, high-performance, and mobile-friendly library perfect for this kind of geo-visualization tool.
    
*   **Tile Layer Selection:** A key design decision was to offer multiple map backgrounds (Standard, Terrain, Black & White). Crucially, the Black & White tile layer was specifically sourced from the **CartoDB Light** service, replacing a prior service to ensure reliability and avoid the 401 Unauthorized error when deployed on public web servers.
    

### 2\. State Management and Interaction Flow

*   **Centralized State:** All data is managed within the global linkPlanner object, which tracks:
    
    *   towers: Location and operational frequency (in GHz).
        
    *   links: The connection between two towers.
        
    *   activeLinkPhase: Manages the two-click process required to establish a link.
        
*   **Intuitive Workflow:**
    
    1.  **Placement:** Simple map click to place a new tower.
        
    2.  **Configuration:** Clicking a tower uses a prompt() box to quickly edit its operating frequency.
        
    3.  **Link Validation:** The handleTowerClick logic enforces that a link can only be created if the start and end towers share the **same frequency**, providing a basic, real-world constraint.
        
*   **Feedback:** Visual cues, such as the yellow border around the first tower in a link sequence and the highlighted orange line for the currently selected link, provide clear user feedback.
    

### 3\. Core RF Calculation and Visualization

The most complex part of the design is the accurate rendering of the First Fresnel Zone ellipse:

*   $$R\_1 = \\sqrt{\\frac{\\lambda D}{4}}$$where $\\lambda$ is the wavelength (calculated from the frequency using the speed of light, $c$) and $D$ is the total link distance (in meters).
    
*   **SVG Visualization (The Key Decision):** Leaflet does not natively draw geodesics or ellipses based on distance and rotation. To achieve this, the application uses a dynamic **SVG Overlay** (fresnel-svg-overlay) positioned over the map.
    
    *   The drawFresnelZone function calculates the **center point**, the **bearing (rotation angle)**, and, critically, translates the real-world distance and Fresnel radius into **screen pixel dimensions** (rx and ry for the ellipse).
        
    *   The ellipse is then drawn, centered, and rotated using SVG transform attributes, ensuring the visualization accurately reflects the required clearance for the RF signal path.
        
    *   The visualization is dynamically updated via the map.on('moveend') event, guaranteeing the ellipse maintains its correct position and scale whenever the user pans or zooms the map.
