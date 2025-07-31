// West Malaysia Building Database - Main Application Script

// Global variables
let map;
let markers = [];
let buildingData = [];
let filteredData = [];
let selectedItems = new Set();
let isLoading = false;
let currentPolygon = null; // Track current highlighted polygon

// Selected Malaysian states with precise boundaries
const stateInfo = {
    'johor': {
        name: "Johor",
        areaId: 2939653, // Official OSM relation ID for Johor state - precise boundaries (tested working)
        // Coordinate boundaries (fallback - only used if areaId fails)
        // Comprehensive boundaries to include all of Johor including Iskandar Puteri and Sunway Iskandar
        south: 1.2,   // Southern Johor (includes Iskandar Puteri area)
        west: 101.5,  // Western Johor (includes Sunway Iskandar area)
        north: 2.85,  // Northern boundary
        east: 104.5   // Eastern boundary
    },
    'malacca': {
        name: "Malacca",
        areaId: 3602939673, // Official OSM area ID for Malacca state
        // Coordinate boundaries (fallback)
        south: 2.0,
        west: 102.0,
        north: 2.6,
        east: 102.6
    },
    'penang': {
        name: "Penang",
        // Coordinate boundaries covering island and mainland areas (more reliable)
        south: 5.2,
        west: 100.1,
        north: 5.7,
        east: 100.6
    },
    'kedah': {
        name: "Kedah",
        // Precise Kedah state coordinate boundaries (avoiding Penang and Thailand overlap)
        south: 5.6,  // Moved north to avoid Penang overlap
        west: 99.6,
        north: 6.5,  // Moved south to avoid Thailand overlap
        east: 101.0  // Moved west to avoid Thailand overlap
    },
    'perlis': {
        name: "Perlis",
        // Perlis state coordinate boundaries (more reliable)
        south: 6.3,
        west: 100.1,
        north: 6.7,
        east: 100.6
    },
    'selangor': {
        name: "Selangor",
        // Selangor state coordinate boundaries
        south: 2.5,
        west: 100.8,
        north: 4.0,
        east: 102.0
    },
    'kuala-lumpur': {
        name: "Kuala Lumpur",
        // Kuala Lumpur federal territory coordinate boundaries
        south: 3.0,
        west: 101.6,
        north: 3.3,
        east: 101.8
    },
    'putrajaya': {
        name: "Putrajaya",
        // Putrajaya federal territory coordinate boundaries
        south: 2.9,
        west: 101.6,
        north: 3.0,
        east: 101.7
    },
    'negeri-sembilan': {
        name: "Negeri Sembilan",
        // Negeri Sembilan state coordinate boundaries
        south: 2.4,
        west: 101.8,
        north: 3.2,
        east: 102.5
    },
    'perak': {
        name: "Perak",
        // Perak state coordinate boundaries
        south: 3.5,
        west: 100.5,
        north: 5.5,
        east: 101.8
    },
    'terengganu': {
        name: "Terengganu",
        // Terengganu state coordinate boundaries
        south: 4.0,
        west: 102.5,
        north: 5.8,
        east: 103.5
    }
};

// Overpass API endpoint
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Function to fetch polygon data using Nominatim API (like Google Maps)
async function fetchAreaPolygon(areaName, stateName) {
    try {
        console.log(`Fetching polygon for: ${areaName}, ${stateName}`);
        
        // Clean area name for search
        const cleanAreaName = areaName.replace(/[^\w\s]/g, '').trim();
        
        // Use Nominatim API to get GeoJSON polygon data
        const searchQuery = `${cleanAreaName}, ${stateName}`;
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=geojson&polygon_geojson=1&limit=1`;
        
        console.log('Fetching from Nominatim:', nominatimUrl);
        
        const response = await fetch(nominatimUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Nominatim data received:', data);
        
        if (data.features && data.features.length > 0) {
            return processNominatimData(data, areaName);
        } else {
            // Fallback to Overpass API if Nominatim doesn't find anything
            return await fetchOverpassPolygon(cleanAreaName);
        }
        
    } catch (error) {
        console.error('Error fetching polygon from Nominatim:', error);
        // Fallback to Overpass API
        return await fetchOverpassPolygon(cleanAreaName);
    }
}

// Process Nominatim GeoJSON data
function processNominatimData(data, areaName) {
    const polygons = [];
    
    data.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'Polygon') {
            // Convert GeoJSON coordinates to Leaflet format
            const coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]); // Swap lat/lng
            
            polygons.push({
                name: areaName,
                coordinates: coordinates,
                type: 'nominatim_polygon'
            });
        } else if (feature.geometry && feature.geometry.type === 'MultiPolygon') {
            // Handle MultiPolygon
            feature.geometry.coordinates.forEach(polygon => {
                const coordinates = polygon[0].map(coord => [coord[1], coord[0]]); // Swap lat/lng
                polygons.push({
                    name: areaName,
                    coordinates: coordinates,
                    type: 'nominatim_multipolygon'
                });
            });
        }
    });
    
    console.log('Processed Nominatim polygons:', polygons.length);
    return polygons.length > 0 ? polygons : null;
}

// Fallback to Overpass API
async function fetchOverpassPolygon(cleanAreaName) {
    try {
        console.log('Falling back to Overpass API for:', cleanAreaName);
        
        const query = `
            [out:json][timeout:60];
            (
              relation["name"~"${cleanAreaName}",i]["place"];
              way["name"~"${cleanAreaName}",i]["place"];
              relation["name"~"${cleanAreaName}",i]["boundary"="administrative"];
              way["name"~"${cleanAreaName}",i]["boundary"="administrative"];
              relation["name"~"${cleanAreaName}",i]["landuse"];
              way["name"~"${cleanAreaName}",i]["landuse"];
            );
            out body;
            >;
            out skel qt;
        `;
        
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            body: query,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Overpass fallback data received:', data);
        
        if (data.elements && data.elements.length > 0) {
            return processPolygonData(data, cleanAreaName);
        } else {
            // Final fallback to bounding box
            return createBoundingBoxPolygon(cleanAreaName);
        }
        
    } catch (error) {
        console.error('Error in Overpass fallback:', error);
        // Final fallback to bounding box
        return createBoundingBoxPolygon(cleanAreaName);
    }
}
        

// Process polygon data from Overpass API
function processPolygonData(data, areaName) {
    const polygons = [];
    const processedWays = new Set();
    
    console.log('Processing polygon data:', data.elements.length, 'elements');
    
    data.elements.forEach(element => {
        if (element.type === 'relation' && element.members) {
            // Process relation (administrative boundary)
            const coordinates = [];
            const wayIds = [];
            
            // Collect all way IDs from the relation
            element.members.forEach(member => {
                if (member.type === 'way' && member.ref) {
                    wayIds.push(member.ref);
                }
            });
            
            // Sort ways to create a continuous boundary
            const sortedWays = sortWaysForBoundary(wayIds, data.elements);
            
            // Build coordinates from sorted ways
            sortedWays.forEach(wayId => {
                const way = data.elements.find(el => el.type === 'way' && el.id === wayId);
                if (way && way.nodes) {
                    way.nodes.forEach(nodeId => {
                        const node = data.elements.find(el => el.type === 'node' && el.id === nodeId);
                        if (node && node.lat && node.lon) {
                            coordinates.push([node.lat, node.lon]);
                        }
                    });
                }
            });
            
            if (coordinates.length > 0) {
                // Ensure polygon is closed
                if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
                    coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
                    coordinates.push(coordinates[0]);
                }
                    
                polygons.push({
                    name: areaName,
                    coordinates: coordinates,
                    type: 'relation'
                });
            }
        } else if (element.type === 'way' && element.nodes && !processedWays.has(element.id)) {
            // Process individual way (linear boundary)
            const coordinates = [];
            element.nodes.forEach(nodeId => {
                const node = data.elements.find(el => el.type === 'node' && el.id === nodeId);
                if (node && node.lat && node.lon) {
                    coordinates.push([node.lat, node.lon]);
                }
            });
            
            if (coordinates.length > 0) {
                // Ensure polygon is closed
                if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
                    coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
                    coordinates.push(coordinates[0]);
                }
                    
                polygons.push({
                    name: areaName,
                    coordinates: coordinates,
                    type: 'way'
                });
                processedWays.add(element.id);
            }
        }
    });
    
    console.log('Generated', polygons.length, 'polygons for', areaName);
    return polygons.length > 0 ? polygons : null;
}

// Sort ways to create a continuous boundary
function sortWaysForBoundary(wayIds, elements) {
    const ways = wayIds.map(id => elements.find(el => el.type === 'way' && el.id === id)).filter(Boolean);
    const sortedWays = [];
    const usedWays = new Set();
    
    if (ways.length === 0) return [];
    
    // Start with the first way
    let currentWay = ways[0];
    sortedWays.push(currentWay.id);
    usedWays.add(currentWay.id);
    
    // Find connected ways
    while (sortedWays.length < ways.length) {
        let found = false;
        
        for (const way of ways) {
            if (usedWays.has(way.id)) continue;
            
            // Check if this way connects to the current way
            const currentNodes = currentWay.nodes;
            const wayNodes = way.nodes;
            
            if (currentNodes && wayNodes) {
                const currentFirst = currentNodes[0];
                const currentLast = currentNodes[currentNodes.length - 1];
                const wayFirst = wayNodes[0];
                const wayLast = wayNodes[wayNodes.length - 1];
                
                if (currentLast === wayFirst || currentLast === wayLast || 
                    currentFirst === wayFirst || currentFirst === wayLast) {
                    sortedWays.push(way.id);
                    usedWays.add(way.id);
                    currentWay = way;
                    found = true;
                    break;
                }
            }
        }
        
        if (!found) break;
    }
    
    return sortedWays;
}

// Create precise polygon based on building distribution in the area
function createBoundingBoxPolygon(areaName) {
    const areaBuildings = buildingData.filter(building => 
        building.city === areaName || 
        building.district === areaName ||
        building.area === areaName
    );
    
    if (areaBuildings.length === 0) {
        return null;
    }
    
    // Calculate precise bounds based on actual building locations
    const lats = areaBuildings.map(b => b.latitude);
    const lngs = areaBuildings.map(b => b.longitude);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const coordinates = [
        [minLat, minLng],
        [minLat, maxLng],
        [maxLat, maxLng],
        [maxLat, minLng],
        [minLat, minLng]
    ];
    
    return [{
        name: areaName,
        coordinates: coordinates,
        type: 'google_maps_style'
    }];
}

// Display polygon on the map
function displayPolygon(polygons, areaName) {
    // Remove existing polygon
    if (currentPolygon) {
        map.removeLayer(currentPolygon);
        currentPolygon = null;
    }
    
    if (!polygons || polygons.length === 0) {
        console.log('No polygon data available for:', areaName);
        return;
    }
    
    // Create the main polygon layer with simple styling
    const polygonLayers = polygons.map(polygon => {
        return L.polygon(polygon.coordinates, {
            color: '#FF69B4',
            weight: 2,
            opacity: 1,
            fillColor: '#FF69B4',
            fillOpacity: 0.2
        });
    });
    
    // Add all polygon layers to map
    polygonLayers.forEach(layer => {
        layer.addTo(map);
    });
    
    // Store reference to current polygon
    currentPolygon = L.layerGroup(polygonLayers);
    
    // Fit map to show the polygon
    if (polygonLayers.length > 0) {
        const group = L.featureGroup(polygonLayers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
    
    // Show notification
    showPolygonNotification(areaName);
}



// Show notification when polygon is displayed
function showPolygonNotification(areaName) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #48bb78; color: white; padding: 15px 20px; 
        border-radius: 8px; z-index: 1000; max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; text-align: center;
    `;
    notification.innerHTML = `🗺️ <strong>${areaName}</strong> area highlighted`;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
        }
    }, 3000);
}

// Clear all polygons from the map
function clearPolygon() {
    // Remove current polygon if exists
    if (currentPolygon) {
        map.removeLayer(currentPolygon);
        currentPolygon = null;
    }
    
    // Remove all polygon layers from the map
    map.eachLayer((layer) => {
        if (layer instanceof L.Polygon) {
            map.removeLayer(layer);
        }
    });
    
    // Show notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #48bb78; color: white; padding: 15px 20px; 
        border-radius: 8px; z-index: 1000; max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; text-align: center;
    `;
    notification.innerHTML = `🗺️ All polygons cleared`;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 2 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
        }
    }, 2000);
}

// Generate polygon data for all buildings (for export)
async function generatePolygonDataForAllBuildings() {
    console.log('Generating polygon data for all buildings...');
    
    const uniqueAreas = [...new Set(buildingData.map(b => b.city))];
    const uniqueDistricts = [...new Set(buildingData.map(b => b.district))];
    
    const allAreas = [...uniqueAreas, ...uniqueDistricts];
    const polygonCache = {};
    
    // Generate polygons for each unique area
    for (const area of allAreas) {
        if (area && area !== 'Unknown' && area !== 'Unknown District') {
            try {
                const polygons = await fetchAreaPolygon(area, buildingData[0]?.state || 'Malaysia');
                if (polygons) {
                    polygonCache[area] = polygons;
                }
            } catch (error) {
                console.log(`Could not generate polygon for ${area}:`, error);
            }
        }
    }
    
    // Update building data with polygon information
    buildingData.forEach(building => {
        if (polygonCache[building.city]) {
            building.polygonData = polygonCache[building.city];
        } else if (polygonCache[building.district]) {
            building.polygonData = polygonCache[building.district];
        }
    });
    
    console.log('Polygon data generation complete');
    return polygonCache;
}

// Show area polygon (called from popup buttons)
async function showAreaPolygon(areaName, stateName) {
    try {
        console.log(`Showing polygon for: ${areaName}, ${stateName}`);
        
        // Check for known areas with specific coordinates
        const knownArea = getKnownAreaCoordinates(areaName);
        if (knownArea) {
            console.log('Using known coordinates for', areaName);
            displayPolygon([knownArea], areaName);
            return;
        }
        
        // Show loading notification
        const loadingNotification = document.createElement('div');
        loadingNotification.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #ffd700; color: #333; padding: 15px 20px; 
            border-radius: 8px; z-index: 1000; max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px; text-align: center;
        `;
        loadingNotification.innerHTML = `🔄 Loading polygon for <strong>${areaName}</strong>...`;
        document.body.appendChild(loadingNotification);
        
        // Fetch polygon data
        const polygons = await fetchAreaPolygon(areaName, stateName);
        
        // Remove loading notification
        if (document.body.contains(loadingNotification)) {
            loadingNotification.remove();
        }
        
        // Display polygon
        displayPolygon(polygons, areaName);
        
    } catch (error) {
        console.error('Error showing area polygon:', error);
        
        // Show error notification
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #f56565; color: white; padding: 15px 20px; 
            border-radius: 8px; z-index: 1000; max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px; text-align: center;
        `;
        errorNotification.innerHTML = `❌ Could not load polygon for <strong>${areaName}</strong>. Using bounding box instead.`;
        document.body.appendChild(errorNotification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(errorNotification)) {
                errorNotification.remove();
            }
        }, 5000);
        
        // Try to show bounding box as fallback
        const fallbackPolygons = createBoundingBoxPolygon(areaName);
        displayPolygon(fallbackPolygons, areaName);
    }
}

// Get known area coordinates for specific areas like Bukit Bintang
function getKnownAreaCoordinates(areaName) {
    const knownAreas = {
        'Bukit Bintang': {
            name: 'Bukit Bintang',
            coordinates: [
                [3.1467855, 101.7113043], // Center point from Google Maps
                [3.1487855, 101.7093043],
                [3.1487855, 101.7133043],
                [3.1447855, 101.7133043],
                [3.1447855, 101.7093043],
                [3.1467855, 101.7113043] // Close polygon
            ],
            type: 'known_area'
        },
        'Kuala Lumpur': {
            name: 'Kuala Lumpur',
            coordinates: [
                [3.1390, 101.6869],
                [3.1390, 101.6969],
                [3.1290, 101.6969],
                [3.1290, 101.6869],
                [3.1390, 101.6869]
            ],
            type: 'known_area'
        }
    };
    
    return knownAreas[areaName] || null;
}

// Function to fetch building data from OpenStreetMap using Overpass API
async function fetchBuildingData() {
    const selectedState = document.getElementById('stateFilter').value;
    
    if (!selectedState) {
        alert('Please select a state first!');
        return;
    }
    
    // Handle all states uniformly
    setLoading(true);
    
    try {
        const stateData = stateInfo[selectedState];
        let data = { elements: [] };
        
        if (selectedState === 'johor') {
            // Use area ID approach for Johor to get precise boundaries
            console.log('Fetching Johor using area ID for precise boundaries...');
            const query = buildOverpassQuery(stateData);
            
            const response = await fetch(OVERPASS_API, {
                method: 'POST',
                body: query,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            data = await response.json();
        } else {
            const query = buildOverpassQuery(stateData);
            
            const response = await fetch(OVERPASS_API, {
                method: 'POST',
                body: query,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            data = await response.json();
        }
        
        console.log('Received data:', data);
        console.log(`Raw data contains ${data.elements?.length || 0} elements`);
        
        buildingData = processBuildingData(data, selectedState);
        filteredData = [...buildingData];
        
        console.log(`Processed ${buildingData.length} buildings for ${stateData.name}`);
        
        if (buildingData.length === 0) {
            throw new Error(`No buildings found for ${stateData.name}. This might be due to API limits or the area having no mapped buildings.`);
        }
        
        // Debug: Show coordinate range of fetched data
        if (buildingData.length > 0) {
            const lats = buildingData.map(b => b.latitude);
            const lngs = buildingData.map(b => b.longitude);
            console.log(`Coordinate range - Lat: ${Math.min(...lats).toFixed(3)} to ${Math.max(...lats).toFixed(3)}, Lng: ${Math.min(...lngs).toFixed(3)} to ${Math.max(...lngs).toFixed(3)}`);
        }
        
        // Initialize map with the fetched data
        setLoading(false);
        initMap();
        
        try {
            console.log('Starting filter updates...');
            updateCascadingFilters();
            console.log('Cascading filters updated');
            updateCategoryFilter();
            console.log('Category filter updated');
            updateTable();
            console.log('Table updated');
            updateMapMarkers();
            console.log('Map markers updated');
            updateStats();
            console.log('Stats updated');
        } catch (error) {
            console.error('Error updating filters:', error);
            // Continue anyway to show the data
        }
        
        document.getElementById('currentState').textContent = stateData.name;
        
        // Show fetching summary
        showFetchingSummary(stateData.name, buildingData);
        
    } catch (error) {
        console.error('Error fetching building data:', error);
        showError('Error fetching building data: ' + error.message + 
                 '\n\nThis might be due to network issues or API limits. Please try again in a few minutes.');
        setLoading(false);
    }
}

// Build Overpass API query for buildings in a specific Malaysian state using area IDs or coordinate boundaries
function buildOverpassQuery(areaData) {
    // Use area ID if available (more precise), otherwise fall back to coordinates
    if (areaData.areaId) {
        const timeout = 900; // Longer timeout for area-based queries
        return `
            [out:json][timeout:${timeout}];
            rel(${areaData.areaId});
            map_to_area -> .searchArea;
            nwr(area.searchArea)[building];
            out center;
        `;
    } else {
        // Coordinate-based query with simplified structure for better reliability
        const timeout = 900; // Reduced timeout for faster response
        return `
            [out:json][timeout:${timeout}];
            (
              nwr["building"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              nwr["amenity"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              nwr["shop"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              nwr["office"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
            );
            out center;
        `;
    }
}

// Process the raw Overpass API data into our application format
function processBuildingData(overpassData, stateName) {
    const buildings = [];
    let id = 1;
    let filteredCount = 0;
    
    console.log(`Processing ${overpassData.elements.length} raw elements for ${stateName}...`);
    
    // Process in smaller chunks to avoid stack overflow for large datasets like Johor
    const chunkSize = 1000;
    const elements = overpassData.elements;
    
    for (let i = 0; i < elements.length; i += chunkSize) {
        const chunk = elements.slice(i, i + chunkSize);
        const chunkNum = Math.floor(i/chunkSize) + 1;
        const totalChunks = Math.ceil(elements.length/chunkSize);
        console.log(`Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} elements)`);
        
        chunk.forEach(element => {
        // Handle both area-based and coordinate-based query responses
        const elementCenter = element.center || (element.lat && element.lon ? {lat: element.lat, lon: element.lon} : null);
        const elementTags = element.tags || {};
        
        if (elementCenter && Object.keys(elementTags).length > 0) {
            // Filter out non-Malaysian data
            const country = elementTags['addr:country'] || elementTags['is_in:country'] || '';
            const state = elementTags['addr:state'] || elementTags['is_in:state'] || '';
            const city = elementTags['addr:city'] || elementTags['addr:subdistrict'] || '';
            
            // Skip if explicitly marked as Singapore or other countries
            if (country && country !== 'MY' && country !== 'Malaysia') {
                filteredCount++;
                return;
            }
            if (city.toLowerCase().includes('singapore')) {
                filteredCount++;
                return;
            }
            if (state.toLowerCase().includes('singapore')) {
                filteredCount++;
                return;
            }
            
            // Special handling for Johor to ensure Iskandar Puteri and Sunway Iskandar are included
            if (stateName === 'johor') {
                // Include Iskandar Puteri area specifically (broader range)
                const isInIskandarPuteri = elementCenter.lat >= 1.35 && elementCenter.lat <= 1.55 && 
                                          elementCenter.lng >= 103.4 && elementCenter.lng <= 103.9;
                
                // Include Sunway Iskandar area specifically
                const isInSunwayIskandar = elementCenter.lat >= 1.4 && elementCenter.lat <= 1.5 && 
                                          elementCenter.lng >= 103.5 && elementCenter.lng <= 103.8;
                
                if (isInIskandarPuteri) {
                    console.log('Including Iskandar Puteri building:', buildingName);
                }
                if (isInSunwayIskandar) {
                    console.log('Including Sunway Iskandar building:', buildingName);
                }
            }
            
            // Enhanced filtering for Johor to exclude Singapore data (only needed for coordinate-based queries)
            if (stateName === 'johor' && !stateInfo[stateName].areaId) {
                // Singapore boundaries: 1.16°N to 1.47°N and 103.6°E to 104.0°E
                // Exclude anything that falls within Singapore territory
                if (elementCenter.lat >= 1.16 && elementCenter.lat <= 1.47 && 
                    elementCenter.lng >= 103.6 && elementCenter.lng <= 104.0) {
                    filteredCount++;
                    return;
                }
                
                // Additional safety check: exclude anything south of the Johor-Singapore border
                if (elementCenter.lat < 1.2) {
                    filteredCount++;
                    return;
                }
            }
            
            // Enhanced filtering for Kedah to exclude Penang and Thailand data
            if (stateName === 'kedah') {
                // Penang boundaries: approximately 5.2°N to 5.7°N and 100.1°E to 100.6°E
                // Exclude anything that falls within Penang territory
                if (elementCenter.lat >= 5.2 && elementCenter.lat <= 5.7 && 
                    elementCenter.lng >= 100.1 && elementCenter.lng <= 100.6) {
                    filteredCount++;
                    return;
                }
                
                // Additional safety check: exclude anything in the Penang area
                if (elementCenter.lat < 5.6 && elementCenter.lng > 100.0 && elementCenter.lng < 100.7) {
                    filteredCount++;
                    return;
                }
                
                // Thailand boundaries: exclude anything north of Malaysia-Thailand border
                // Malaysia-Thailand border is approximately at 6.7°N
                if (elementCenter.lat > 6.7) {
                    filteredCount++;
                    return;
                }
                
                // Additional Thailand filtering: exclude anything in southern Thailand area
                if (elementCenter.lat > 6.5 && elementCenter.lng > 101.0) {
                    filteredCount++;
                    return;
                }
            }
            
            // Data validation and cleaning
            const buildingName = getBuildingName(elementTags);
            const category = getBuildingCategory(elementTags);
            const address = getAddress(elementTags);
            const buildingCity = getCityFromTags(elementTags, stateName);
            const district = getDistrictFromTags(elementTags, stateName);
            const area = getAreaFromTags(elementTags, stateName);
            
            // Skip buildings with invalid or missing essential data
            if (!buildingName || buildingName === 'Building' || buildingName === 'yes') {
                filteredCount++;
                return;
            }
            
            // Skip buildings with invalid coordinates
            if (isNaN(elementCenter.lat) || isNaN(elementCenter.lon) ||
                elementCenter.lat === 0 || elementCenter.lon === 0) {
                filteredCount++;
                return;
            }
            
            // Skip duplicate buildings (same name and location)
            const existingBuilding = buildings.find(b => 
                b.building === buildingName && 
                Math.abs(b.latitude - elementCenter.lat) < 0.001 &&
                Math.abs(b.longitude - elementCenter.lon) < 0.001
            );
            
            if (existingBuilding) {
                filteredCount++;
                return;
            }
            
            const building = {
                id: id++,
                building: buildingName,
                category: category,
                address: address,
                city: buildingCity,
                district: district,
                area: area,
                state: stateInfo[stateName].name,
                latitude: elementCenter.lat,
                longitude: elementCenter.lon,
                tags: elementTags, // Keep original tags for reference
                polygonData: null // Will be populated when needed
            };
            
            buildings.push(building);
        }
        });
    }
    
    console.log(`Filtered out ${filteredCount} non-Malaysian buildings`);
    
    // Debug: Log sample of available tags to understand data structure
    if (buildings.length > 0) {
        console.log("=== SAMPLE BUILDING TAGS DEBUG ===");
        const sampleBuildings = buildings.slice(0, 5);
        sampleBuildings.forEach((building, index) => {
            console.log(`Building ${index + 1} tags:`, building.tags);
            console.log(`Extracted - City: "${building.city}", District: "${building.district}"`);
        });
    }
    
    return buildings;
}

// Enhanced building name extraction from OSM tags
function getBuildingName(tags) {
    // Priority order for building names
    const nameSources = [
        tags.name,
        tags['name:en'],
        tags['name:ms'],
        tags['name:zh'],
        tags['name:ta'],
        tags.brand,
        tags.operator,
        tags['addr:housename'],
        tags['addr:housenumber'] && tags['addr:street'] ? 
            `${tags['addr:housenumber']} ${tags['addr:street']}` : null
    ];
    
    // Find the first valid name
    let name = nameSources.find(source => source && source.trim() !== '');
    
    // Enhanced fallback logic with better categorization
    if (!name || name === 'yes') {
        // Residential buildings
        if (tags.building === 'residential' || tags.building === 'house' || 
            tags.building === 'apartments' || tags.building === 'detached' ||
            tags.amenity === 'housing' || tags.landuse === 'residential') {
            return tags['addr:housenumber'] ? 
                `Residence ${tags['addr:housenumber']}` : 'Residential Building';
        }
        
        // Commercial buildings
        if (tags.building === 'commercial' || tags.building === 'retail' || 
            tags.building === 'shop' || tags.shop) {
            return tags.shop ? `${tags.shop.charAt(0).toUpperCase() + tags.shop.slice(1)} Store` : 'Commercial Building';
        }
        
        // Office buildings
        if (tags.building === 'office' || tags.office) {
            return tags.office ? `${tags.office.charAt(0).toUpperCase() + tags.office.slice(1)} Office` : 'Office Building';
        }
        
        // Industrial buildings
        if (tags.building === 'industrial' || tags.building === 'warehouse' || 
            tags.building === 'factory') {
            return 'Industrial Building';
        }
        
        // Religious buildings
        if (tags.building === 'religious' || tags.amenity === 'place_of_worship') {
            return tags.religion ? `${tags.religion.charAt(0).toUpperCase() + tags.religion.slice(1)} Place of Worship` : 'Religious Building';
        }
        
        // Educational buildings
        if (tags.building === 'school' || tags.amenity === 'school' || 
            tags.amenity === 'university' || tags.amenity === 'college') {
            return tags.amenity ? `${tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1)}` : 'Educational Building';
        }
        
        // Healthcare buildings
        if (tags.building === 'hospital' || tags.amenity === 'hospital' || 
            tags.amenity === 'clinic' || tags.amenity === 'doctors') {
            return tags.amenity ? `${tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1)}` : 'Healthcare Building';
        }
        
        // Hotel buildings
        if (tags.building === 'hotel' || tags.tourism === 'hotel' || 
            tags.amenity === 'hotel') {
            return 'Hotel';
        }
        
        // Government buildings
        if (tags.building === 'government' || tags.amenity === 'police' || 
            tags.amenity === 'fire_station' || tags.amenity === 'townhall') {
            return tags.amenity ? `${tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1)}` : 'Government Building';
        }
        
        // Generic building types
        if (tags.building) {
            return `${tags.building.charAt(0).toUpperCase() + tags.building.slice(1)} Building`;
        }
        
        // Amenity-based names
        if (tags.amenity) {
            return `${tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1)}`;
        }
        
        // Shop-based names
        if (tags.shop) {
            return `${tags.shop.charAt(0).toUpperCase() + tags.shop.slice(1)} Store`;
        }
        
        return 'Building';
    }
    
    // Clean up the name
    return name.trim();
}

// Enhanced address extraction from OSM tags
function getAddress(tags) {
    const addressParts = [];
    
    // House number
    if (tags['addr:housenumber']) {
        addressParts.push(tags['addr:housenumber']);
    }
    
    // Street name
    if (tags['addr:street']) {
        addressParts.push(tags['addr:street']);
    }
    
    // Suburb/neighborhood
    if (tags['addr:suburb']) {
        addressParts.push(tags['addr:suburb']);
    }
    
    // City
    if (tags['addr:city']) {
        addressParts.push(tags['addr:city']);
    }
    
    // District
    if (tags['addr:district']) {
        addressParts.push(tags['addr:district']);
    }
    
    // Postcode
    if (tags['addr:postcode']) {
        addressParts.push(tags['addr:postcode']);
    }
    
    // State
    if (tags['addr:state']) {
        addressParts.push(tags['addr:state']);
    }
    
    // If we have address parts, format them nicely
    if (addressParts.length > 0) {
        return addressParts.join(', ');
    }
    
    // Fallback: try to construct from other tags
    const fallbackParts = [];
    
    if (tags['addr:housename']) {
        fallbackParts.push(tags['addr:housename']);
    }
    
    if (tags['addr:street']) {
        fallbackParts.push(tags['addr:street']);
    }
    
    if (tags['addr:city']) {
        fallbackParts.push(tags['addr:city']);
    }
    
    if (fallbackParts.length > 0) {
        return fallbackParts.join(', ');
    }
    
    return 'Address not available';
}

// Enhanced building categorization based on OSM tags
function getBuildingCategory(tags) {
    // Healthcare facilities
    if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || 
        tags.amenity === 'doctors' || tags.amenity === 'pharmacy' ||
        tags.building === 'hospital') {
        return 'Healthcare';
    }
    
    // Educational institutions
    if (tags.amenity === 'school' || tags.amenity === 'university' || 
        tags.amenity === 'college' || tags.amenity === 'kindergarten' ||
        tags.building === 'school') {
        return 'Educational Institution';
    }
    
    // Food & Beverage
    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || 
        tags.amenity === 'fast_food' || tags.amenity === 'food_court' ||
        tags.amenity === 'bar' || tags.amenity === 'pub') {
        return 'Food & Beverage';
    }
    
    // Financial services
    if (tags.amenity === 'bank' || tags.amenity === 'atm' || 
        tags.amenity === 'insurance') {
        return 'Financial Services';
    }
    
    // Transportation
    if (tags.amenity === 'fuel' || tags.amenity === 'car_wash' ||
        tags.amenity === 'car_rental' || tags.amenity === 'taxi') {
        return 'Transportation';
    }
    
    // Religious sites
    if (tags.amenity === 'place_of_worship' || tags.building === 'religious' ||
        tags.religion) {
        return 'Religious Site';
    }
    
    // Government buildings
    if (tags.amenity === 'police' || tags.amenity === 'fire_station' || 
        tags.amenity === 'townhall' || tags.amenity === 'courthouse' ||
        tags.building === 'government') {
        return 'Government Building';
    }
    
    // Postal services
    if (tags.amenity === 'post_office') {
        return 'Postal Services';
    }
    
    // Public services
    if (tags.amenity === 'library' || tags.amenity === 'community_centre' ||
        tags.amenity === 'social_facility') {
        return 'Public Services';
    }
    
    // Parking
    if (tags.amenity === 'parking' || tags.building === 'parking') {
        return 'Parking';
    }
    
    // Shopping and retail
    if (tags.shop) {
        if (tags.shop === 'mall' || tags.shop === 'department_store' || 
            tags.shop === 'supermarket' || tags.shop === 'convenience') {
            return 'Shopping Mall';
        }
        return 'Retail Store';
    }
    
    // Tourism and accommodation
    if (tags.tourism === 'hotel' || tags.tourism === 'motel' || 
        tags.tourism === 'hostel' || tags.building === 'hotel' ||
        tags.amenity === 'hotel') {
        return 'Hotel';
    }
    
    if (tags.tourism === 'attraction' || tags.tourism === 'museum' || 
        tags.tourism === 'gallery' || tags.tourism === 'viewpoint') {
        return 'Tourist Attraction';
    }
    
    // Sports and recreation
    if (tags.leisure === 'sports_centre' || tags.leisure === 'fitness_centre' ||
        tags.leisure === 'swimming_pool' || tags.leisure === 'stadium') {
        return 'Sports & Recreation';
    }
    
    // Parks and recreation
    if (tags.leisure === 'park' || tags.leisure === 'playground' ||
        tags.leisure === 'garden') {
        return 'Park & Recreation';
    }
    
    // Office buildings
    if (tags.office || tags.building === 'office') {
        return 'Office Building';
    }
    
    // Commercial buildings
    if (tags.building === 'commercial' || tags.building === 'retail' ||
        tags.building === 'shop') {
        return 'Commercial Building';
    }
    
    // Industrial buildings
    if (tags.building === 'industrial' || tags.building === 'warehouse' ||
        tags.building === 'factory') {
        return 'Industrial Building';
    }
    
    // Residential buildings
    if (tags.building === 'residential' || tags.building === 'apartments' ||
        tags.building === 'house' || tags.building === 'detached' ||
        tags.amenity === 'housing') {
        return 'Residential Building';
    }
    
    // Generic building types
    if (tags.building) {
        return `${tags.building.charAt(0).toUpperCase() + tags.building.slice(1)} Building`;
    }
    
    // Generic amenities
    if (tags.amenity) {
        return 'Public Amenity';
    }
    
    return 'Unknown';
}

// Get district from tags or infer from location
function getDistrictFromTags(tags, stateName) {
    // Try various district tag formats
    if (tags['addr:district']) return tags['addr:district'];
    if (tags['addr:state_district']) return tags['addr:state_district'];
    if (tags['is_in:district']) return tags['is_in:district'];
    if (tags['district']) return tags['district'];
    
    // Try to extract from name or other location tags
    const name = (tags['name'] || '').toLowerCase();
    const city = (tags['addr:city'] || tags['addr:subdistrict'] || '').toLowerCase();
    const street = (tags['addr:street'] || '').toLowerCase();
    const suburb = (tags['addr:suburb'] || '').toLowerCase();
    const amenity = (tags['amenity'] || '').toLowerCase();
    
    // Enhanced location-based inference for Johor
    if (stateName === 'johor') {
        // Check all available text fields for district indicators
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        // Priority areas - Iskandar Puteri and Sunway Iskandar
        if (allText.includes('iskandar puteri') || allText.includes('puteri iskandar') || allText.includes('iskandar') || allText.includes('nusajaya') || allText.includes('medini') || allText.includes('bukit indah') || allText.includes('horizon hills') || allText.includes('edu city') || allText.includes('legoland')) return 'Iskandar Puteri';
        if (allText.includes('sunway iskandar') || allText.includes('sunway')) return 'Sunway Iskandar';
        
        if (allText.includes('johor bahru') || allText.includes('jb') || allText.includes('skudai') || allText.includes('masai') || allText.includes('gelang patah')) return 'Johor Bahru';
        if (allText.includes('kulai') || allText.includes('senai')) return 'Kulai';
        if (allText.includes('pontian')) return 'Pontian';
        if (allText.includes('batu pahat')) return 'Batu Pahat';
        if (allText.includes('kluang')) return 'Kluang';
        if (allText.includes('segamat')) return 'Segamat';
        if (allText.includes('mersing')) return 'Mersing';
        if (allText.includes('kota tinggi')) return 'Kota Tinggi';
        if (allText.includes('muar')) return 'Muar';
        if (allText.includes('ledang') || allText.includes('tangkak')) return 'Ledang';
        
        // Default major areas for general locations
        return 'Johor Bahru'; // Most buildings likely in JB area
    }
    
    // Enhanced location-based inference for Selangor
    if (stateName === 'selangor') {
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        if (allText.includes('petaling') || allText.includes('pj') || allText.includes('shah alam') || allText.includes('subang')) return 'Petaling';
        if (allText.includes('klang') || allText.includes('port klang')) return 'Klang';
        if (allText.includes('gombak') || allText.includes('batu caves')) return 'Gombak';
        if (allText.includes('hulu langat') || allText.includes('kajang') || allText.includes('cheras') || allText.includes('ampang')) return 'Hulu Langat';
        if (allText.includes('kuala selangor')) return 'Kuala Selangor';
        if (allText.includes('sepang') || allText.includes('cyberjaya')) return 'Sepang';
        if (allText.includes('rawang')) return 'Gombak';
        
        // Default to Petaling for central areas
        return 'Petaling';
    }
    
    // Enhanced location-based inference for Kuala Lumpur
    if (stateName === 'kuala-lumpur') {
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        if (allText.includes('bangsar') || allText.includes('brickfields')) return 'Bangsar';
        if (allText.includes('bukit bintang') || allText.includes('klcc')) return 'Bukit Bintang';
        if (allText.includes('cheras')) return 'Cheras';
        if (allText.includes('kepong')) return 'Kepong';
        if (allText.includes('klang lama')) return 'Segambut';
        if (allText.includes('segambut')) return 'Segambut';
        if (allText.includes('sentul')) return 'Sentul';
        if (allText.includes('setapak') || allText.includes('wangsa maju')) return 'Titiwangsa';
        if (allText.includes('titiwangsa')) return 'Titiwangsa';
        
        return 'Kuala Lumpur';
    }
    
    // Enhanced location-based inference for Putrajaya
    if (stateName === 'putrajaya') {
        return 'Putrajaya';
    }
    
    // Enhanced location-based inference for Negeri Sembilan
    if (stateName === 'negeri-sembilan') {
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        if (allText.includes('seremban')) return 'Seremban';
        if (allText.includes('nilai')) return 'Seremban';
        if (allText.includes('port dickson') || allText.includes('pd')) return 'Port Dickson';
        if (allText.includes('jelebu')) return 'Jelebu';
        if (allText.includes('jempol')) return 'Jempol';
        if (allText.includes('rembau')) return 'Rembau';
        if (allText.includes('tampin')) return 'Tampin';
        
        return 'Seremban';
    }
    
    // Enhanced location-based inference for Perak
    if (stateName === 'perak') {
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        if (allText.includes('ipoh')) return 'Kinta';
        if (allText.includes('taiping')) return 'Larut, Matang dan Selama';
        if (allText.includes('kuala kangsar')) return 'Kuala Kangsar';
        if (allText.includes('lumut') || allText.includes('manjung')) return 'Manjung';
        if (allText.includes('parit buntar')) return 'Kerian';
        if (allText.includes('batu gajah')) return 'Kinta';
        if (allText.includes('kampar')) return 'Kampar';
        if (allText.includes('trolak') || allText.includes('slim river')) return 'Batang Padang';
        if (allText.includes('tanjung malim')) return 'Batang Padang';
        
        return 'Kinta';
    }
    
    // Enhanced location-based inference for Terengganu
    if (stateName === 'terengganu') {
        const allText = `${name} ${city} ${street} ${suburb} ${amenity}`.toLowerCase();
        
        if (allText.includes('kuala terengganu') || allText.includes('kt')) return 'Kuala Terengganu';
        if (allText.includes('dungun')) return 'Dungun';
        if (allText.includes('kemaman')) return 'Kemaman';
        if (allText.includes('marang')) return 'Marang';
        if (allText.includes('hulu terengganu')) return 'Hulu Terengganu';
        if (allText.includes('besut')) return 'Besut';
        if (allText.includes('setiu')) return 'Setiu';
        
        return 'Kuala Terengganu';
    }
    
    // For smaller states, use the state name as district
    if (stateName === 'kuala-lumpur') return 'Kuala Lumpur';
    if (stateName === 'putrajaya') return 'Putrajaya';
    if (stateName === 'malacca') return 'Malacca Tengah';
    if (stateName === 'penang') return 'Georgetown';
    if (stateName === 'perlis') return 'Kangar';
    
    // For larger states, provide reasonable defaults
    if (stateName === 'perak') return 'Kinta'; // Ipoh area
    if (stateName === 'kedah') return 'Kota Setar'; // Alor Setar area
    if (stateName === 'negeri-sembilan') return 'Seremban';
    
    return stateInfo[stateName]?.name || 'Unknown District';
}

// Get city from tags or infer from location  
function getCityFromTags(tags, stateName) {
    // Try various city tag formats
    if (tags['addr:city']) return tags['addr:city'];
    if (tags['addr:subdistrict']) return tags['addr:subdistrict'];
    if (tags['addr:suburb']) return tags['addr:suburb'];
    if (tags['is_in:city']) return tags['is_in:city'];
    if (tags['city']) return tags['city'];
    
    // Try to extract from place tags
    if (tags['place']) {
        if (tags['place'] === 'city' || tags['place'] === 'town' || tags['place'] === 'village') {
            if (tags['name']) return tags['name'];
        }
    }
    
    // Enhanced inference from all available text fields
    const name = (tags['name'] || '').toLowerCase();
    const street = (tags['addr:street'] || '').toLowerCase();
    const amenity = (tags['amenity'] || '').toLowerCase();
    const allText = `${name} ${street} ${amenity}`.toLowerCase();
    
    // Enhanced city inference for Johor
    if (stateName === 'johor') {
        // Priority areas - Iskandar Puteri and Sunway Iskandar
        if (allText.includes('iskandar puteri') || allText.includes('puteri iskandar') || allText.includes('iskandar') || allText.includes('nusajaya') || allText.includes('medini') || allText.includes('bukit indah') || allText.includes('horizon hills') || allText.includes('taman nusa idaman') || allText.includes('taman nusajaya') || allText.includes('edu city') || allText.includes('legoland')) return 'Iskandar Puteri';
        if (allText.includes('sunway iskandar') || allText.includes('sunway') || allText.includes('iskandar')) return 'Sunway Iskandar';
        
        // Other major Johor areas
        if (allText.includes('johor bahru') || allText.includes('jb')) return 'Johor Bahru';
        if (allText.includes('skudai')) return 'Skudai';
        if (allText.includes('kulai')) return 'Kulai';
        if (allText.includes('senai')) return 'Senai';
        if (allText.includes('pontian')) return 'Pontian';
        if (allText.includes('batu pahat')) return 'Batu Pahat';
        if (allText.includes('kluang')) return 'Kluang';
        if (allText.includes('segamat')) return 'Segamat';
        if (allText.includes('mersing')) return 'Mersing';
        if (allText.includes('kota tinggi')) return 'Kota Tinggi';
        if (allText.includes('muar')) return 'Muar';
        if (allText.includes('tangkak')) return 'Tangkak';
        if (allText.includes('masai')) return 'Masai';
        if (allText.includes('gelang patah')) return 'Gelang Patah';
        if (allText.includes('pasir gudang')) return 'Pasir Gudang';
        if (allText.includes('tebrau')) return 'Tebrau';
        if (allText.includes('plentong')) return 'Plentong';
        if (allText.includes('pulai')) return 'Pulai';
        
        // Default to Johor Bahru for central locations
        return 'Johor Bahru';
    }
    
    // Enhanced city inference for Selangor
    if (stateName === 'selangor') {
        if (allText.includes('shah alam')) return 'Shah Alam';
        if (allText.includes('petaling jaya') || allText.includes('pj')) return 'Petaling Jaya';
        if (allText.includes('subang jaya')) return 'Subang Jaya';
        if (allText.includes('klang')) return 'Klang';
        if (allText.includes('kajang')) return 'Kajang';
        if (allText.includes('ampang')) return 'Ampang';
        if (allText.includes('cheras')) return 'Cheras';
        if (allText.includes('batu caves')) return 'Batu Caves';
        if (allText.includes('cyberjaya')) return 'Cyberjaya';
        if (allText.includes('sepang')) return 'Sepang';
        if (allText.includes('rawang')) return 'Rawang';
        if (allText.includes('port klang')) return 'Port Klang';
        
        // Default to Shah Alam for central locations
        return 'Shah Alam';
    }
    
    // Enhanced city inference for Kuala Lumpur
    if (stateName === 'kuala-lumpur') {
        if (allText.includes('kuala lumpur') || allText.includes('kl')) return 'Kuala Lumpur';
        if (allText.includes('bangsar')) return 'Bangsar';
        if (allText.includes('brickfields')) return 'Brickfields';
        if (allText.includes('bukit bintang')) return 'Bukit Bintang';
        if (allText.includes('cheras')) return 'Cheras';
        if (allText.includes('kepong')) return 'Kepong';
        if (allText.includes('klang lama')) return 'Klang Lama';
        if (allText.includes('segambut')) return 'Segambut';
        if (allText.includes('sentul')) return 'Sentul';
        if (allText.includes('setapak')) return 'Setapak';
        if (allText.includes('titiwangsa')) return 'Titiwangsa';
        if (allText.includes('wangsa maju')) return 'Wangsa Maju';
        
        return 'Kuala Lumpur';
    }
    
    // Enhanced city inference for Putrajaya
    if (stateName === 'putrajaya') {
        return 'Putrajaya';
    }
    
    // Enhanced city inference for Negeri Sembilan
    if (stateName === 'negeri-sembilan') {
        if (allText.includes('seremban')) return 'Seremban';
        if (allText.includes('nilai')) return 'Nilai';
        if (allText.includes('port dickson') || allText.includes('pd')) return 'Port Dickson';
        if (allText.includes('jelebu')) return 'Jelebu';
        if (allText.includes('jempol')) return 'Jempol';
        if (allText.includes('rembau')) return 'Rembau';
        if (allText.includes('tampin')) return 'Tampin';
        
        return 'Seremban';
    }
    
    // Enhanced city inference for Perak
    if (stateName === 'perak') {
        if (allText.includes('ipoh')) return 'Ipoh';
        if (allText.includes('taiping')) return 'Taiping';
        if (allText.includes('kuala kangsar')) return 'Kuala Kangsar';
        if (allText.includes('lumut')) return 'Lumut';
        if (allText.includes('manjung')) return 'Manjung';
        if (allText.includes('parit buntar')) return 'Parit Buntar';
        if (allText.includes('batu gajah')) return 'Batu Gajah';
        if (allText.includes('kampar')) return 'Kampar';
        if (allText.includes('trolak')) return 'Trolak';
        if (allText.includes('slim river')) return 'Slim River';
        if (allText.includes('tanjung malim')) return 'Tanjung Malim';
        
        return 'Ipoh';
    }
    
    // Enhanced city inference for Terengganu
    if (stateName === 'terengganu') {
        if (allText.includes('kuala terengganu') || allText.includes('kt')) return 'Kuala Terengganu';
        if (allText.includes('dungun')) return 'Dungun';
        if (allText.includes('kemaman')) return 'Kemaman';
        if (allText.includes('marang')) return 'Marang';
        if (allText.includes('hulu terengganu')) return 'Hulu Terengganu';
        if (allText.includes('besut')) return 'Besut';
        if (allText.includes('setiu')) return 'Setiu';
        
        return 'Kuala Terengganu';
    }
    
    // For other states, use building name or reasonable defaults
    if (tags['name']) {
        return tags['name'];
    }
    
    // State-specific defaults
    if (stateName === 'kuala-lumpur') return 'Kuala Lumpur';
    if (stateName === 'putrajaya') return 'Putrajaya';
    if (stateName === 'penang') return 'Georgetown';
    if (stateName === 'malacca') return 'Malacca City';
    if (stateName === 'perak') return 'Ipoh';
    if (stateName === 'kedah') return 'Alor Setar';
    if (stateName === 'perlis') return 'Kangar';
    if (stateName === 'negeri-sembilan') return 'Seremban';
    
    return stateInfo[stateName]?.name || 'Unknown City';
}

// Get area from tags or infer from location
function getAreaFromTags(tags, stateName) {
    if (tags['addr:state_district']) return tags['addr:state_district'];
    if (tags['addr:district']) return tags['addr:district'];
    
    // Default to state name
    return stateInfo[stateName]?.name || 'Unknown Area';
}

// Set loading state
function setLoading(loading) {
    isLoading = loading;
    const fetchBtn = document.getElementById('fetchBtn');
    const mapDiv = document.getElementById('map');
    const progressContainer = document.getElementById('progressContainer');
    
    if (loading) {
        fetchBtn.textContent = 'Fetching Buildings...';
        fetchBtn.disabled = true;
        mapDiv.innerHTML = '<div class="loading">Fetching building data from OpenStreetMap...<br>This may take 30-90 seconds for large areas...</div>';
        progressContainer.style.display = 'block';
        updateProgress(0, 'Preparing API request...');
        
        // Simulate progress
        setTimeout(() => updateProgress(20, 'Sending request to OpenStreetMap...'), 1000);
        setTimeout(() => updateProgress(40, 'Receiving data...'), 5000);
        setTimeout(() => updateProgress(60, 'Processing building information...'), 15000);
        setTimeout(() => updateProgress(80, 'Categorizing and filtering buildings...'), 25000);
        setTimeout(() => updateProgress(95, 'Populating filters with counts...'), 35000);
        setTimeout(() => updateProgress(100, 'Complete!'), 45000); // Force completion after 45 seconds
    } else {
        fetchBtn.textContent = 'Fetch Buildings';
        fetchBtn.disabled = false;
        progressContainer.style.display = 'none';
        updateProgress(100, 'Complete!');
    }
}

// Update progress bar
function updateProgress(percent, text) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = text;
}

// Show error message
function showError(message) {
    const mapDiv = document.getElementById('map');
    mapDiv.innerHTML = `<div class="error-message">${message}</div>`;
}

// Show fetching summary with statistics
function showFetchingSummary(stateName, buildings) {
    // Calculate summary statistics
    const totalBuildings = buildings.length;
    const categories = [...new Set(buildings.map(b => b.category))];
    const areas = [...new Set(buildings.map(b => b.area))];
    const districts = [...new Set(buildings.map(b => b.district))];
    const cities = [...new Set(buildings.map(b => b.city))];
    
    // Find top categories
    const categoryStats = {};
    buildings.forEach(building => {
        categoryStats[building.category] = (categoryStats[building.category] || 0) + 1;
    });
    const topCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, count]) => `${cat} (${count})`)
        .join(', ');
    
    const summary = `
        🎉 <strong>Fetching Complete for ${stateName}!</strong><br><br>
        📊 <strong>Summary:</strong><br>
        • Total Buildings: <strong>${totalBuildings.toLocaleString()}</strong><br>
        • Areas: <strong>${areas.length}</strong><br>
        • Districts: <strong>${districts.length}</strong><br>
        • Cities: <strong>${cities.length}</strong><br>
        • Categories: <strong>${categories.length}</strong><br><br>
        🏢 <strong>Top Categories:</strong><br>
        ${topCategories}<br><br>
        💡 Use the filters above to explore the data!<br>
        🗺️ <strong>New:</strong> Click on building names, place names, or state names to highlight areas on the map!
    `;
    
    // Show notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: #48bb78; color: white; padding: 20px; 
        border-radius: 8px; z-index: 1000; max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; line-height: 1.5;
    `;
    notification.innerHTML = summary;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute; top: 5px; right: 10px;
        background: none; border: none; color: white;
        font-size: 20px; cursor: pointer; padding: 0;
        width: 25px; height: 25px;
    `;
    closeBtn.onclick = () => notification.remove();
    notification.appendChild(closeBtn);
    
    document.body.appendChild(notification);
    
    // Auto-remove after 15 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
        }
    }, 15000);
    
    // Also log to console
    console.log(`=== FETCHING SUMMARY FOR ${stateName.toUpperCase()} ===`);
    console.log(`Total Buildings: ${totalBuildings.toLocaleString()}`);
    console.log(`Areas: ${areas.length} | Districts: ${districts.length} | Cities: ${cities.length}`);
    console.log(`Categories: ${categories.length}`);
    console.log('Top Categories:', Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).slice(0, 10));
}

// Initialize OpenStreetMap with Leaflet
function initMap() {
    if (map) {
        map.remove(); // Remove existing map if any
    }
    
    // Clear loading text
    document.getElementById('map').innerHTML = '';
    
    map = L.map('map').setView([4.2105, 101.9758], 7); // Center of Malaysia
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    updateMapMarkers();
}

// Update map markers
function updateMapMarkers() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    if (!map || filteredData.length === 0) return;
    
    // Limit markers for performance (show max 2000 on map)
    const markersToShow = filteredData.slice(0, 2000);
    
    // Create new markers
    markersToShow.forEach(item => {
        const marker = L.marker([item.latitude, item.longitude], {
            icon: getCategoryIcon(item.category),
            title: item.building
        });
        
        const popupContent = `
            <div style="font-family: Arial, sans-serif; min-width: 250px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${item.building}</h3>
                <p style="margin: 3px 0;"><strong>Category:</strong> <span style="padding: 2px 6px; background: #e2e8f0; border-radius: 10px; font-size: 11px;">${item.category}</span></p>
                <p style="margin: 3px 0;"><strong>Address:</strong> ${item.address}</p>
                <p style="margin: 3px 0;"><strong>Place:</strong> ${item.city}</p>
                <p style="margin: 3px 0;"><strong>State:</strong> ${item.state}</p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">
                    📍 ${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}
                </p>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        marker.addTo(map);
        markers.push(marker);
    });
    
    // Fit map to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    } else {
        // Reset to Malaysia view if no markers
        map.setView([4.2105, 101.9758], 7);
    }
    
    // Show notification if too many buildings
    if (filteredData.length > 2000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: #ffd700; color: #333; padding: 10px; 
            border-radius: 6px; z-index: 1000; max-width: 300px;
        `;
        notification.innerHTML = `<strong>Note:</strong> Showing first 2,000 buildings on map out of ${filteredData.length} total results. Use filters to narrow down.`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

// Get category-specific emoji marker icon
function getCategoryIcon(category) {
    const iconEmojis = {
        'Healthcare': '🏥',                // Hospital
        'Educational Institution': '🏫',   // School
        'Food & Beverage': '🍽️',          // Restaurant/Food
        'Financial Services': '🏦',        // Bank
        'Religious Site': '🕌',            // Mosque/Religious building
        'Government Building': '🏛️',       // Government building
        'Hotel': '🏨',                     // Hotel
        'Tourist Attraction': '🎯',        // Tourist attraction
        'Shopping Mall': '🏬',             // Shopping mall
        'Retail Store': '🏪',              // Store
        'Shop': '🛍️',                     // Shopping
        'Office Building': '🏢',           // Office building
        'Commercial Building': '🏬',       // Commercial building
        'Industrial Building': '🏭',       // Factory/Industrial
        'Residential Building': '🏠',      // House/Residential
        'Sports & Recreation': '⚽',       // Sports
        'Park & Recreation': '🏞️',        // Park
        'Gas Station': '⛽',               // Gas station
        'Postal Services': '📮',           // Post office
        'Public Services': '🏛️',          // Public services
        'Parking': '🅿️',                  // Parking
        'Public Amenity': '🏢',           // Generic public building
        'Tourism': '🧳',                   // Tourism
        'Leisure': '🎮',                   // Leisure
        'Building': '🏢',                 // Generic building
        'Unknown': '❓'                    // Unknown
    };
    
    const emoji = iconEmojis[category] || '🏗️';
    
    return L.divIcon({
        className: 'emoji-marker',
        html: `<div style="
            font-size: 16px;
            line-height: 16px;
            text-align: center;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            border: 2px solid #333;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        ">${emoji}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });
}

// Focus on specific marker
function focusOnMarker(item) {
    const marker = markers.find(m => {
        const pos = m.getLatLng();
        return Math.abs(pos.lat - item.latitude) < 0.0001 &&
               Math.abs(pos.lng - item.longitude) < 0.0001;
    });
    
    if (marker) {
        map.setView([item.latitude, item.longitude], 16);
        marker.openPopup();
    }
}

// Initialize the application
function initApp() {
    buildingData = [];
    filteredData = [];
    
    populateFilters();
    updateTable();
    updateStats();
}

// Populate filter dropdowns
function populateFilters() {
    // States are predefined in HTML
    // Categories will be populated after data is fetched
    updateCategoryFilter();
}

// Update category filter based on current data with counts
function updateCategoryFilter() {
    if (buildingData.length === 0) return;
    
    // Get categories with counts
    const categoryStats = {};
    buildingData.forEach(building => {
        categoryStats[building.category] = (categoryStats[building.category] || 0) + 1;
    });
    
    const categories = Object.keys(categoryStats).sort();
    const categorySelect = document.getElementById('categoryFilter');
    categorySelect.innerHTML = '<option value="">All Categories (' + buildingData.length + ' buildings)</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = `${category} (${categoryStats[category]} buildings)`;
        categorySelect.appendChild(option);
    });
    
    // Update polygon dropdown asynchronously to avoid blocking
    setTimeout(() => {
        updatePolygonFilter();
    }, 100);
}

// Update polygon filter with available areas
function updatePolygonFilter() {
    if (buildingData.length === 0) return;
    
    console.log('Updating polygon filter...');
    
    const polygonSelect = document.getElementById('polygonFilter');
    polygonSelect.innerHTML = '<option value="">Select area to highlight...</option>';
    
    // Limit to top 50 cities and districts for performance
    const cityCounts = {};
    const districtCounts = {};
    
    buildingData.forEach(building => {
        if (building.city && building.city !== 'Unknown') {
            cityCounts[building.city] = (cityCounts[building.city] || 0) + 1;
        }
        if (building.district && building.district !== 'Unknown District') {
            districtCounts[building.district] = (districtCounts[building.district] || 0) + 1;
        }
    });
    
    // Get top cities by building count
    const topCities = Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([city]) => city);
    
    // Get top districts by building count
    const topDistricts = Object.entries(districtCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([district]) => district);
    
    // Add cities
    topCities.forEach(city => {
        const option = document.createElement('option');
        option.value = `city:${city}`;
        option.textContent = `🗺️ ${city} (${cityCounts[city]} buildings)`;
        polygonSelect.appendChild(option);
    });
    
    // Add districts
    topDistricts.forEach(district => {
        const option = document.createElement('option');
        option.value = `district:${district}`;
        option.textContent = `🗺️ ${district} (${districtCounts[district]} buildings)`;
        polygonSelect.appendChild(option);
    });
    
    // Add known areas
    const knownAreas = ['Bukit Bintang', 'Kuala Lumpur', 'Johor Bahru', 'Petaling Jaya', 'Shah Alam'];
    knownAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = `known:${area}`;
        option.textContent = `⭐ ${area} (Known Area)`;
        polygonSelect.appendChild(option);
    });
    
    console.log('Polygon filter updated with', topCities.length, 'cities and', topDistricts.length, 'districts');
}

// Update filters with building counts (simplified)
function updateCascadingFilters() {
    if (buildingData.length === 0) return;
    
    console.log('Updating filters...');
    
    const placeNameFilter = document.getElementById('placeNameFilter');
    const currentPlaceName = placeNameFilter.value;
    
    const state = document.getElementById('stateFilter').value;
    
    // Update place names based on state
    if (state) {
        const stateName = stateInfo[state]?.name;
        const stateBuildings = buildingData.filter(item => item.state === stateName);
        
        // Get unique place names (cities) with counts
        const placeStats = {};
        stateBuildings.forEach(building => {
            placeStats[building.city] = (placeStats[building.city] || 0) + 1;
        });
        
        const places = Object.keys(placeStats).sort();
        placeNameFilter.innerHTML = '<option value="">All Places (' + stateBuildings.length + ' buildings)</option>';
        
        places.forEach(place => {
            const option = document.createElement('option');
            option.value = place;
            option.textContent = `${place} (${placeStats[place]} buildings)`;
            placeNameFilter.appendChild(option);
        });
        placeNameFilter.disabled = false;
        
        // Restore previous selection if it still exists
        if (currentPlaceName && places.includes(currentPlaceName)) {
            placeNameFilter.value = currentPlaceName;
        }
    } else {
        placeNameFilter.innerHTML = '<option value="">Select State First</option>';
        placeNameFilter.disabled = true;
    }
    
    // Update category filter
    updateCategoryFilter();
}

// Apply filters (simplified)
function applyFilters() {
    if (buildingData.length === 0) {
        filteredData = [];
        updateTable();
        updateMapMarkers();
        updateStats();
        return;
    }
    
    const state = document.getElementById('stateFilter').value;
    const placeName = document.getElementById('placeNameFilter').value;
    const category = document.getElementById('categoryFilter').value;
    const searchTerm = document.getElementById('searchFilter').value.toLowerCase().trim();
    
    const stateName = state ? stateInfo[state]?.name : null;
    
    filteredData = buildingData.filter(item => {
        // Basic filters
        const stateMatch = !stateName || item.state === stateName;
        const placeMatch = !placeName || item.city === placeName;
        const categoryMatch = !category || item.category === category;
        
        // Search filter
        const searchMatch = !searchTerm || 
            item.building.toLowerCase().includes(searchTerm) ||
            item.address.toLowerCase().includes(searchTerm) ||
            item.city.toLowerCase().includes(searchTerm) ||
            item.district.toLowerCase().includes(searchTerm) ||
            item.category.toLowerCase().includes(searchTerm);
        
        return stateMatch && placeMatch && categoryMatch && searchMatch;
    });
    
    updateTable();
    updateMapMarkers();
    updateStats();
    clearSelection();
}

// Update data table
function updateTable() {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';
    
    // Show max 1000 rows in table for performance
    const rowsToShow = filteredData.slice(0, 1000);
    
    rowsToShow.forEach(item => {
        const row = document.createElement('tr');
        row.onclick = () => focusOnMarker(item);
        
        row.innerHTML = `
            <td><input type="checkbox" value="${item.id}" onchange="updateSelection()"></td>
            <td><strong>${item.building}</strong></td>
            <td><span style="padding: 2px 8px; background: #e2e8f0; border-radius: 12px; font-size: 11px;">${item.category}</span></td>
            <td>${item.city}</td>
            <td>${item.state}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    document.getElementById('resultsCount').textContent = 
        filteredData.length > 1000 ? 
        `(${filteredData.length} results, showing first 1000)` : 
        `(${filteredData.length} results)`;
}

// Update statistics
function updateStats() {
    document.getElementById('totalLocations').textContent = buildingData.length;
    document.getElementById('filteredLocations').textContent = filteredData.length;
    document.getElementById('selectedLocations').textContent = selectedItems.size;
}

// Selection management
function updateSelection() {
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    selectedItems.clear();
    
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedItems.add(parseInt(checkbox.value));
        }
    });
    
    updateStats();
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectedItems.size === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
    } else if (selectedItems.size === filteredData.length) {
        // All filtered buildings are selected (not just visible ones)
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else {
        selectAllCheckbox.indeterminate = true;
    }
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    
    if (selectAllCheckbox.checked) {
        // Select all filtered buildings
        selectedItems.clear();
        filteredData.forEach(item => {
            selectedItems.add(item.id);
        });
        
        // Update visible checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
    } else {
        // Clear all selections
        selectedItems.clear();
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    updateStats();
}

function selectAll() {
    // Select all filtered buildings, not just visible ones in table
    selectedItems.clear();
    filteredData.forEach(item => {
        selectedItems.add(item.id);
    });
    
    // Update all visible checkboxes
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (filteredData.length > 0) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    }
    
    updateStats();
}

function clearSelection() {
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateSelection();
}

// Reset all filters
function resetFilters() {
    document.getElementById('stateFilter').value = '';
    document.getElementById('placeNameFilter').value = '';
    document.getElementById('categoryFilter').value = '';
    document.getElementById('searchFilter').value = '';
    
    // Reset filter states
    document.getElementById('placeNameFilter').disabled = true;
    
    document.getElementById('placeNameFilter').innerHTML = '<option value="">Select State First</option>';
    
    // Clear data and reset display
    buildingData = [];
    filteredData = [];
    clearSelection();
    clearPolygon(); // Clear any highlighted polygons
    updateTable();
    updateMapMarkers();
    updateStats();
    
    document.getElementById('currentState').textContent = '-';
    document.getElementById('map').innerHTML = '<div class="loading">Select a state and click "Fetch Buildings" to load building data</div>';
}

// Export functions
async function exportToExcel() {
    const selectedData = getSelectedData();
    if (selectedData.length === 0) {
        alert('Please select at least one building to export.');
        return;
    }
    
    const worksheet = XLSX.utils.json_to_sheet(selectedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Malaysia Buildings");
    
    const stateName = document.getElementById('currentState').textContent.replace(/\s+/g, '_').toLowerCase();
    const fileName = `malaysia_buildings_${stateName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

async function exportToCSV() {
    const selectedData = getSelectedData();
    if (selectedData.length === 0) {
        alert('Please select at least one building to export.');
        return;
    }
    
    const headers = Object.keys(selectedData[0]);
    const csvContent = [
        headers.join(','),
        ...selectedData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const stateName = document.getElementById('currentState').textContent.replace(/\s+/g, '_').toLowerCase();
    a.download = `malaysia_buildings_${stateName}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Export polygons only to Excel
async function exportPolygonsToExcel() {
    if (buildingData.length === 0) {
        alert('Please fetch building data first.');
        return;
    }
    
    // Show loading notification
    const loadingNotification = document.createElement('div');
    loadingNotification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #ffd700; color: #333; padding: 15px 20px; 
        border-radius: 8px; z-index: 1000; max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; text-align: center;
    `;
    loadingNotification.innerHTML = `🔄 Generating polygon data for all areas...`;
    document.body.appendChild(loadingNotification);
    
    try {
        // Generate polygon data for all unique areas
        await generatePolygonDataForAllBuildings();
        
        // Create polygon-only export data
        const polygonData = [];
        const uniqueAreas = [...new Set(buildingData.map(b => b.city))];
        
        uniqueAreas.forEach(area => {
            if (area && area !== 'Unknown') {
                const areaBuildings = buildingData.filter(b => b.city === area);
                const firstBuilding = areaBuildings[0];
                
                if (firstBuilding && firstBuilding.polygonData) {
                    polygonData.push({
                        'Area Name': area,
                        'State': firstBuilding.state,
                        'Total Buildings': areaBuildings.length,
                        'Polygon Coordinates': JSON.stringify(firstBuilding.polygonData),
                        'Polygon Type': firstBuilding.polygonData[0]?.type || 'unknown'
                    });
                }
            }
        });
        
        // Remove loading notification
        if (document.body.contains(loadingNotification)) {
            loadingNotification.remove();
        }
        
        if (polygonData.length === 0) {
            alert('No polygon data available for export.');
            return;
        }
        
        const worksheet = XLSX.utils.json_to_sheet(polygonData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Malaysia Polygons");
        
        const stateName = document.getElementById('currentState').textContent.replace(/\s+/g, '_').toLowerCase();
        const fileName = `malaysia_polygons_${stateName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
    } catch (error) {
        console.error('Error generating polygon data:', error);
        if (document.body.contains(loadingNotification)) {
            loadingNotification.remove();
        }
        alert('Error generating polygon data. Please try again.');
    }
}

// Export polygons only to CSV
async function exportPolygonsToCSV() {
    if (buildingData.length === 0) {
        alert('Please fetch building data first.');
        return;
    }
    
    // Show loading notification
    const loadingNotification = document.createElement('div');
    loadingNotification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #ffd700; color: #333; padding: 15px 20px; 
        border-radius: 8px; z-index: 1000; max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; text-align: center;
    `;
    loadingNotification.innerHTML = `🔄 Generating polygon data for all areas...`;
    document.body.appendChild(loadingNotification);
    
    try {
        // Generate polygon data for all unique areas
        await generatePolygonDataForAllBuildings();
        
        // Create polygon-only export data
        const polygonData = [];
        const uniqueAreas = [...new Set(buildingData.map(b => b.city))];
        
        uniqueAreas.forEach(area => {
            if (area && area !== 'Unknown') {
                const areaBuildings = buildingData.filter(b => b.city === area);
                const firstBuilding = areaBuildings[0];
                
                if (firstBuilding && firstBuilding.polygonData) {
                    polygonData.push({
                        'Area Name': area,
                        'State': firstBuilding.state,
                        'Total Buildings': areaBuildings.length,
                        'Polygon Coordinates': JSON.stringify(firstBuilding.polygonData),
                        'Polygon Type': firstBuilding.polygonData[0]?.type || 'unknown'
                    });
                }
            }
        });
        
        // Remove loading notification
        if (document.body.contains(loadingNotification)) {
            loadingNotification.remove();
        }
        
        if (polygonData.length === 0) {
            alert('No polygon data available for export.');
            return;
        }
        
        const headers = Object.keys(polygonData[0]);
        const csvContent = [
            headers.join(','),
            ...polygonData.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const stateName = document.getElementById('currentState').textContent.replace(/\s+/g, '_').toLowerCase();
        a.download = `malaysia_polygons_${stateName}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error generating polygon data:', error);
        if (document.body.contains(loadingNotification)) {
            loadingNotification.remove();
        }
        alert('Error generating polygon data. Please try again.');
    }
}

function getSelectedData() {
    return filteredData
        .filter(item => selectedItems.has(item.id))
        .map(item => ({
            'State': item.state,
            'Place Name': item.city,
            'District': item.district,
            'Building': item.building,
            'Address': item.address,
            'Category': item.category,
            'Latitude': item.latitude,
            'Longitude': item.longitude,
            'Area': item.area
        }));
}

// Event listeners
document.getElementById('stateFilter').addEventListener('change', () => {
    // Clear existing data when state changes
    buildingData = [];
    filteredData = [];
    clearSelection();
    updateTable();
    updateMapMarkers();
    updateStats();
    
    // Reset place name filter
    document.getElementById('placeNameFilter').innerHTML = '<option value="">Select State First</option>';
    document.getElementById('placeNameFilter').disabled = true;
    
    const selectedState = document.getElementById('stateFilter').value;
    document.getElementById('currentState').textContent = selectedState ? stateInfo[selectedState].name : '-';
    
    if (selectedState) {
        document.getElementById('map').innerHTML = '<div class="loading">Click "Fetch Buildings" to load building data for ' + stateInfo[selectedState].name + '</div>';
    } else {
        document.getElementById('map').innerHTML = '<div class="loading">Select a state and click "Fetch Buildings" to load data</div>';
    }
});

document.getElementById('placeNameFilter').addEventListener('change', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);
document.getElementById('searchFilter').addEventListener('input', applyFilters);
document.getElementById('polygonFilter').addEventListener('change', handlePolygonSelection);



// Handle polygon selection from dropdown
function handlePolygonSelection() {
    const polygonSelect = document.getElementById('polygonFilter');
    const selectedValue = polygonSelect.value;
    
    if (!selectedValue) {
        clearPolygon();
        return;
    }
    
    const [type, areaName] = selectedValue.split(':');
    
    if (type === 'known') {
        // Use known area coordinates
        const knownArea = getKnownAreaCoordinates(areaName);
        if (knownArea) {
            displayPolygon([knownArea], areaName);
        }
    } else if (type === 'city' || type === 'district') {
        // Fetch polygon for city or district
        const stateName = buildingData[0]?.state || 'Malaysia';
        showAreaPolygon(areaName, stateName);
    }
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', initApp);