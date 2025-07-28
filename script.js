// West Malaysia Building Database - Main Application Script

// Global variables
let map;
let markers = [];
let buildingData = [];
let filteredData = [];
let selectedItems = new Set();
let isLoading = false;

// Selected Malaysian states with precise boundaries
// Limited to 5 states as requested: Johor, Malacca, Penang, Kedah, Perlis
const stateInfo = {
    'johor': {
        name: "Johor",
        areaId: 3602939653, // Official OSM area ID for Johor state
        // Coordinate boundaries (fallback - not used when areaId is present)
        south: 1.48,
        west: 103.30,
        north: 2.85,
        east: 104.50
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
        // Kedah state coordinate boundaries (more reliable)
        south: 5.4,
        west: 99.6,
        north: 6.7,
        east: 101.3
    },
    'perlis': {
        name: "Perlis",
        // Perlis state coordinate boundaries (more reliable)
        south: 6.3,
        west: 100.1,
        north: 6.7,
        east: 100.6
    }
};

// Overpass API endpoint
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

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
        const query = buildOverpassQuery(stateData);
        
        console.log('Fetching building data for:', stateData.name);
        console.log('Using query method:', stateData.areaId ? 'Area-based (precise boundaries)' : 'Coordinate-based');
        
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
        
        updateCascadingFilters();
        updateCategoryFilter();
        updateTable();
        updateMapMarkers();
        updateStats();
        
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
            area(${areaData.areaId})->.searchArea;
            (
              nwr["building"](area.searchArea);
              nwr["amenity"](area.searchArea);
              nwr["shop"](area.searchArea);
              nwr["office"](area.searchArea);
              nwr["leisure"](area.searchArea);
              nwr["tourism"](area.searchArea);
              nwr["public_transport"](area.searchArea);
              nwr["healthcare"](area.searchArea);
            );
            out body;
            >;
            out skel qt;
        `;
    } else {
        // Coordinate-based query with shorter timeout for better reliability
        const timeout = 120; // Shorter timeout for coordinate queries
        return `
            [out:json][timeout:${timeout}][maxsize:1073741824];
            (
              way["building"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["amenity"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["shop"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["office"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["leisure"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["tourism"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["public_transport"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              way["healthcare"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              relation["building"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
              relation["amenity"](${areaData.south},${areaData.west},${areaData.north},${areaData.east});
            );
            out center tags;
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
                if (elementCenter.lat < 1.47) {
                    filteredCount++;
                    return;
                }
            }
            
            const building = {
                id: id++,
                building: getBuildingName(elementTags),
                category: getBuildingCategory(elementTags),
                address: getAddress(elementTags),
                city: getCityFromTags(elementTags, stateName),
                district: getDistrictFromTags(elementTags, stateName),
                area: getAreaFromTags(elementTags, stateName),
                state: stateInfo[stateName].name,
                latitude: elementCenter.lat,
                longitude: elementCenter.lon,
                tags: elementTags // Keep original tags for reference
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

// Extract building name from OSM tags
function getBuildingName(tags) {
    // Try to get a proper name first
    let name = tags.name || 
               tags['name:en'] || 
               tags['name:ms'] ||
               tags['addr:housename'] || 
               tags.brand || 
               tags.operator ||
               (tags['addr:housenumber'] && tags['addr:street'] ? 
                `${tags['addr:housenumber']} ${tags['addr:street']}` : null);
    
    // If no proper name found, use fallback logic
    if (!name) {
        name = tags.amenity || tags.shop || tags.office || tags.building || 'Building';
    }
    
    // Replace meaningless "yes" values with more descriptive names
    if (name === 'yes') {
        // Quick residential check without calling expensive getBuildingCategory
        if (tags.building === 'residential' || 
            tags.building === 'house' || 
            tags.building === 'apartments' ||
            tags.amenity === 'housing' || 
            tags.landuse === 'residential' ||
            tags['addr:housenumber']) {
            return 'Residence';
        }
        
        // Quick commercial/office checks
        if (tags.building === 'commercial' || tags.building === 'retail' || tags.shop) {
            return 'Commercial Building';
        }
        
        if (tags.building === 'office' || tags.office) {
            return 'Office Building';
        }
        
        // For other building=yes cases, use simple fallback
        return 'Building';
    }
    
    return name;
}

// Get address from OSM tags
function getAddress(tags) {
    const parts = [];
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
    return parts.length > 0 ? parts.join(' ') : 'Address not available';
}

// Categorize building based on OSM tags
function getBuildingCategory(tags) {
    // Amenities
    if (tags.amenity) {
        switch (tags.amenity) {
            case 'hospital': case 'clinic': case 'doctors': case 'pharmacy': return 'Healthcare';
            case 'school': case 'university': case 'college': case 'kindergarten': return 'Educational Institution';
            case 'restaurant': case 'cafe': case 'fast_food': case 'food_court': return 'Food & Beverage';
            case 'bank': case 'atm': return 'Financial Services';
            case 'fuel': return 'Gas Station';
            case 'place_of_worship': return 'Religious Site';
            case 'police': case 'fire_station': case 'townhall': return 'Government Building';
            case 'post_office': return 'Postal Services';
            case 'library': return 'Public Services';
            case 'parking': return 'Parking';
            default: return 'Public Amenity';
        }
    }
    
    // Shops
    if (tags.shop) {
        if (tags.shop === 'mall' || tags.shop === 'department_store') return 'Shopping Mall';
        if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 'Retail Store';
        return 'Shop';
    }
    
    // Tourism
    if (tags.tourism) {
        switch (tags.tourism) {
            case 'hotel': case 'motel': case 'hostel': return 'Hotel';
            case 'attraction': case 'museum': case 'gallery': return 'Tourist Attraction';
            default: return 'Tourism';
        }
    }
    
    // Leisure
    if (tags.leisure) {
        switch (tags.leisure) {
            case 'sports_centre': case 'fitness_centre': case 'swimming_pool': return 'Sports & Recreation';
            case 'park': case 'playground': return 'Park & Recreation';
            default: return 'Leisure';
        }
    }
    
    // Office
    if (tags.office) {
        return 'Office Building';
    }
    
    // Building types
    if (tags.building) {
        switch (tags.building) {
            case 'hotel': return 'Hotel';
            case 'hospital': return 'Healthcare';
            case 'school': return 'Educational Institution';
            case 'commercial': case 'retail': return 'Commercial Building';
            case 'industrial': case 'warehouse': return 'Industrial Building';
            case 'residential': case 'apartments': case 'house': return 'Residential Building';
            case 'office': return 'Office Building';
            case 'government': return 'Government Building';
            case 'religious': return 'Religious Site';
            default: return 'Building';
        }
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
        
        // Default to Petaling for central areas
        return 'Petaling';
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
        
        // Default to Shah Alam for central locations
        return 'Shah Alam';
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
        💡 Use the filters above to explore the data!
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
    } else if (selectedItems.size === Math.min(filteredData.length, 1000)) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else {
        selectAllCheckbox.indeterminate = true;
    }
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateSelection();
}

function selectAll() {
    const checkboxes = document.querySelectorAll('#dataTableBody input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateSelection();
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
    updateTable();
    updateMapMarkers();
    updateStats();
    
    document.getElementById('currentState').textContent = '-';
    document.getElementById('map').innerHTML = '<div class="loading">Select a state and click "Fetch Buildings" to load building data</div>';
}

// Export functions
function exportToExcel() {
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

function exportToCSV() {
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

function getSelectedData() {
    return filteredData
        .filter(item => selectedItems.has(item.id))
        .map(item => ({
            'State': item.state,
            'Place Name': item.city,
            'Building': item.building,
            'Address': item.address,
            'Category': item.category,
            'Latitude': item.latitude,
            'Longitude': item.longitude
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



// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', initApp);
