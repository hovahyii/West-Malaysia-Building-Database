# West Malaysia Building Database 🏢

A comprehensive web-based database application for exploring, filtering, and managing building data across all West Malaysian states. This interactive tool provides detailed information about buildings, amenities, and points of interest with powerful filtering capabilities and export functionality.

![West Malaysia Building Database](https://img.shields.io/badge/Status-Active-brightgreen) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black) ![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?logo=openstreetmap&logoColor=white)

## ✨ Features

### 🗺️ Interactive Mapping
- **Real-time building visualization** using Leaflet.js and OpenStreetMap
- **Category-based color coding** for different building types
- **Detailed building popups** with comprehensive information
- **Responsive map interface** that adapts to screen sizes
- **Zoom and pan capabilities** with marker clustering for performance

### 🔍 Advanced Filtering System
- **Hierarchical location filtering**: State → Area → District → City
- **Category-based filtering** with building counts
- **Real-time filter updates** with dynamic option population
- **Independent filter combinations** for flexible data exploration
- **Filter statistics** showing available buildings per category

### 📊 Data Management
- **Comprehensive building database** with 15+ categories
- **Real-time statistics dashboard** showing totals and filtered results
- **Bulk selection capabilities** with select all/clear all options
- **Export functionality** to Excel (.xlsx) and CSV formats
- **Progress tracking** for data fetching operations

### 🏗️ Building Categories
- Healthcare (Hospitals, Clinics, Pharmacies)
- Educational Institutions (Schools, Universities, Colleges)
- Food & Beverage (Restaurants, Cafes, Food Courts)
- Financial Services (Banks, ATMs)
- Religious Sites (Mosques, Churches, Temples)
- Government Buildings (Police, Fire Stations, Town Halls)
- Hotels & Accommodation
- Shopping Centers & Retail
- Office Buildings
- Industrial & Warehouse Facilities
- Sports & Recreation Centers
- Tourist Attractions
- And more...

## 🌍 Coverage Areas

### West Malaysian States
- **Johor** - Including Johor Bahru, Kulai, Batu Pahat, Kluang
- **Selangor** - Including Petaling Jaya, Shah Alam, Klang, Subang
- **Kuala Lumpur** - Federal Territory
- **Putrajaya** - Federal Territory
- **Negeri Sembilan** - Including Seremban and surrounding areas
- **Malacca** - Historic state with rich architectural heritage
- **Perak** - Including Ipoh and major townships
- **Penang** - Including Georgetown and Butterworth
- **Kedah** - Including Alor Setar and surrounding areas
- **Perlis** - Northern border state

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for map tiles and data fetching
- No additional software installation required

### Quick Start
1. **Clone or download** this repository
2. **Open `index.html`** in your web browser
3. **Select a state** from the dropdown menu
4. **Click "Fetch Buildings"** to load building data
5. **Use filters** to explore specific areas or building types
6. **Click on map markers** to view detailed building information
7. **Select buildings** and export data as needed

### Usage Instructions

#### Step 1: Select Location
```
1. Choose a state from the "State" dropdown
2. Wait for the area options to populate
3. Optionally filter by Area, District, or City
4. Click "Fetch Buildings" to load data
```

#### Step 2: Filter Data
```
1. Use the Category filter to show specific building types
2. Combine location and category filters for precise results
3. View real-time statistics in the dashboard
4. Observe filtered results in both map and table views
```

#### Step 3: Explore Buildings
```
1. Click on map markers to see building details
2. Use the data table to browse building information
3. Click table rows to focus on specific buildings
4. Sort and filter as needed
```

#### Step 4: Export Data
```
1. Select buildings using checkboxes in the table
2. Use "Select All Visible" for bulk selection
3. Choose export format: Excel (.xlsx) or CSV
4. Download begins automatically
```

## 🛠️ Technical Architecture

### Frontend Technologies
- **HTML5** - Semantic markup and structure
- **CSS3** - Modern styling with gradients, shadows, and responsive design
- **Vanilla JavaScript** - Core application logic and interactivity
- **Leaflet.js** - Interactive mapping functionality
- **SheetJS** - Excel file generation for exports

### Data Sources
- **OpenStreetMap Overpass API** - Real-time building and amenity data
- **Leaflet Map Tiles** - High-quality map visualization
- **Custom categorization logic** - Intelligent building classification

### Key Features Implementation
- **Responsive Grid Layout** - CSS Grid for optimal layout on all devices
- **Progressive Loading** - Efficient data fetching with progress indicators
- **Memory Optimization** - Limited marker rendering for performance
- **Error Handling** - Comprehensive error management and user feedback
- **Accessibility** - Keyboard navigation and screen reader support

### Performance Optimizations
- **Marker Clustering** - Display up to 2,000 markers for optimal performance
- **Table Pagination** - Show up to 1,000 table rows efficiently
- **Lazy Loading** - Data fetched only when needed
- **Caching Strategies** - Efficient data management

## 📁 Project Structure

```
West-Malaysia-Building-Database/
├── index.html              # Main application file
├── README.md              # Project documentation
└── assets/               # (Optional) Future asset directory
    ├── images/           # Screenshots and icons
    ├── data/            # Cached data files
    └── docs/            # Additional documentation
```

## 🔧 Configuration

### API Settings
The application uses the Overpass API for OpenStreetMap data:
- **Endpoint**: `https://overpass-api.de/api/interpreter`
- **Timeout**: 90 seconds for large queries
- **Format**: JSON response with building metadata

### State Boundaries
Predefined coordinate boundaries for each West Malaysian state ensure accurate data fetching and geographical filtering.

### Map Configuration
- **Default Center**: Malaysia (4.2105°N, 101.9758°E)
- **Default Zoom**: Level 7 for country overview
- **Max Zoom**: Level 19 for detailed street view
- **Tile Provider**: OpenStreetMap standard tiles

## 📈 Usage Statistics

### Data Capacity
- **Buildings per state**: Up to 50,000+ buildings
- **Categories supported**: 15+ building types
- **Export capability**: Unlimited selected records
- **Performance**: Optimized for datasets up to 100,000 buildings

### Browser Compatibility
- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 🎯 Use Cases

### Urban Planning
- **Site analysis** for development projects
- **Infrastructure assessment** and planning
- **Zoning compliance** verification
- **Public facility distribution** analysis

### Business Intelligence
- **Market research** for retail location planning
- **Competition analysis** in specific areas
- **Service gap identification** opportunities
- **Demographic correlation** with building types

### Research & Education
- **Urban geography** studies and research
- **Social science** data collection
- **Architecture and planning** coursework
- **GIS applications** and spatial analysis

### Tourism & Navigation
- **Point of interest** discovery
- **Route planning** for tourists
- **Local business** directory functionality
- **Cultural site** identification

## 🤝 Contributing

We welcome contributions to improve the West Malaysia Building Database! Here's how you can help:

### Bug Reports
- Open an issue with detailed bug description
- Include browser information and steps to reproduce
- Provide screenshots if applicable

### Feature Requests
- Suggest new filtering options or categories
- Propose UI/UX improvements
- Request additional data sources or states

### Code Contributions
- Fork the repository
- Create a feature branch
- Submit a pull request with clear description

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Developer

**Created by Hovah (60086951)**

- 🎨 UI/UX Design and Implementation
- 🔧 Backend Logic and Data Processing
- 🗺️ Mapping Integration and Optimization
- 📊 Export Functionality and Performance Tuning

## 📞 Support

For support, feature requests, or questions:
- Create an issue in this repository
- Check existing documentation and FAQ
- Review the code comments for implementation details

## 🔄 Version History

### Current Version: 1.0.0
- ✅ Complete West Malaysia coverage
- ✅ Advanced filtering system
- ✅ Export functionality
- ✅ Responsive design
- ✅ Performance optimizations

### Roadmap
- 🔄 East Malaysia expansion (Sabah, Sarawak)
- 🔄 Advanced search functionality
- 🔄 Building detail enhancement
- 🔄 Offline data caching
- 🔄 Multi-language support

---

**Built with ❤️ for Malaysia's digital infrastructure development**

