import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { 
  Search, Activity, AlertTriangle, Info, Map as MapIcon, 
  Navigation, ChevronUp, ChevronDown, BarChart3 
} from 'lucide-react';

// Custom Marker Function for Categories
const createColoredIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Config with Weights and Leaflet Colors
const categoryConfig = {
  "Saúde": { color: "#ef4444", iconColor: "red", weight: 0.25 },
  "Commerce": { color: "#22c55e", iconColor: "green", weight: 0.20 },
  "Education": { color: "#a855f7", iconColor: "purple", weight: 0.20 },
  "Mobilidade": { color: "#3b82f6", iconColor: "blue", weight: 0.20 },
  "Serviços": { color: "#f59e0b", iconColor: "orange", weight: 0.15 },
  "Default": { color: "#64748b", iconColor: "grey", weight: 0.1 }
};

// Helper to calculate distance in meters
const calculateDistance = (pos1, pos2) => {
  const R = 6371e3; 
  const dLat = (pos2[0] - pos1[0]) * Math.PI / 180;
  const dLon = (pos2[1] - pos1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pos1[0] * Math.PI / 180) * Math.cos(pos2[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, 15); }, [center, map]);
  return null;
}

const App = () => {
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [position, setPosition] = useState([-23.5505, -46.6333]);
  const [places, setPlaces] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showMap, setShowMap] = useState(true);

  const handleCategoryClick = (catLabel) => {
    if (selectedCategory === catLabel) { setSelectedCategory(null); return; }
    setSelectedCategory(catLabel);
  };

  const searchPlaces = async () => {
    const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=jsonv2&limit=1`);
    if (geoRes.data.length === 0) throw new Error("Local não encontrado");
    
    const { lat, lon } = geoRes.data[0];
    const newPos = [parseFloat(lat), parseFloat(lon)];
    setPosition(newPos);

    const query = `[out:json];(node["amenity"~"restaurant|supermarket|clothes|mall|fuel|pharmacy|university|kindergarten|school|police|clinic|hospital|bus_stop|subway_entrance"](around:${radius * 1000},${lat},${lon}););out center;`;
    const placeRes = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    
    const mapped = placeRes.data.elements.map(el => {
      const type = el.tags.amenity;
      let cat = "Serviços";
      if (["hospital", "pharmacy", "clinic"].includes(type)) cat = "Saúde";
      else if (["bus_stop", "subway_entrance"].includes(type)) cat = "Mobilidade";
      else if (["restaurant", "supermarket", "clothes", "mall", "fuel"].includes(type)) cat = "Commerce";
      else if (["school", "kindergarten", "university"].includes(type)) cat = "Education";
      
      const itemPos = [el.lat || el.center.lat, el.lon || el.center.lon];

      return {
        id: el.id,
        name: el.tags.name || type,
        category: cat,
        lat: itemPos[0],
        lon: itemPos[1],
        distance: calculateDistance(newPos, itemPos)
      };
    });
    setPlaces(mapped);
    return { newPos, mapped };
  };

  const handleCompute = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const { mapped } = await searchPlaces();
      
      // DYNAMIC SCORING LOGIC
      const categoriesResults = Object.keys(categoryConfig).filter(k => k !== "Default").map(label => {
        const catItems = mapped.filter(p => p.category === label);
        // Score based on count and proximity (simplified)
        const countBonus = Math.min(catItems.length * 10, 50);
        const proximityBonus = catItems.length > 0 ? 
          Math.max(0, 50 - (Math.min(...catItems.map(i => i.distance)) / (radius * 20))) : 0;
        
        return {
          label,
          score: Math.round(countBonus + proximityBonus),
          color: categoryConfig[label].color,
          items: catItems.sort((a, b) => a.distance - b.distance)
        };
      });

      const totalScore = Math.round(categoriesResults.reduce((acc, cat) => {
        return acc + (cat.score * categoryConfig[cat.label].weight);
      }, 0));

      setData({
        total_score: totalScore,
        poi_name: address,
        categories: categoriesResults,
        penalty: totalScore < 30 ? 10 : 0
      });

    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto bg-white min-h-screen shadow-2xl flex flex-col border-x border-slate-200">
        
        {/* Header */}
        <header className="bg-white p-6 border-b border-slate-200 sticky top-0 z-[1001] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg"><Activity size={24} /></div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">MobilityScore</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7 relative">
              <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500" 
                     placeholder="Endereço..." value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="md:col-span-3 flex gap-2">
              {[1, 2, 5].map(v => (
                <button key={v} onClick={() => setRadius(v)} className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${radius === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{v}km</button>
              ))}
            </div>
            <button onClick={handleCompute} className="md:col-span-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-transform active:scale-95">Calcular</button>
          </div>
        </header>

        <main className="flex-1 p-8">
          {data ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
              
              <div className="lg:col-span-8 space-y-6">
                {showMap && (
                  <div className="rounded-[40px] overflow-hidden border border-slate-200 shadow-xl h-[500px]">
                    <MapContainer center={position} zoom={15} style={{ height: "100%", width: "100%" }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <ChangeView center={position} />
                      
                      <Circle 
                        center={position}
                        radius={radius * 1000}
                        pathOptions={{ 
                          color: '#ef4444', 
                          fillColor: '#ef4444', 
                          fillOpacity: 0.05,
                          dashArray: '10, 10',
                          weight: 2
                        }}
                      />
            
                      <Marker position={position} icon={createColoredIcon('blue')}>
                        <Popup><strong>{address}</strong></Popup>
                      </Marker>

                      {places.map((place) => {
                        const config = categoryConfig[place.category] || categoryConfig.Default;
                        const isVisible = !selectedCategory || selectedCategory === place.category;
                        return (
                          <Marker 
                            key={place.id} 
                            position={[place.lat, place.lon]} 
                            icon={createColoredIcon(config.iconColor)}
                            opacity={isVisible ? 1 : 0.1}
                          >
                            {/* DISTANCE LABEL */}
                            <Tooltip permanent direction="top" offset={[0, -40]} className="bg-white border-none shadow-md rounded px-2 py-1 font-bold text-[10px]">
                              {place.distance}m
                            </Tooltip>
                            <Popup>
                              <span className="font-bold">{place.name}</span><br/>
                              {place.distance} metros de distância
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-900 rounded-[32px] p-8 text-white text-center shadow-xl">
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Dynamic Score</p>
                    <h2 className="text-8xl font-black">{data.total_score}</h2>
                  </div>
                  <div className="bg-blue-50 rounded-[32px] p-8 border border-blue-100">
                    <div className="flex items-center gap-2 mb-4 text-blue-900 font-bold text-xs uppercase"><BarChart3 size={16}/> Composição por Peso</div>
                    <div className="space-y-4">
                      {data.categories.map((cat, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase"><span>{cat.label}</span><span>{cat.score}%</span></div>
                          <div className="h-2 bg-white rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-1000" style={{ width: `${cat.score}%`, backgroundColor: cat.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-4 overflow-y-auto max-h-[850px] pr-2 custom-scrollbar">
                {data.categories.map((cat, idx) => (
                  <button key={idx} onClick={() => handleCategoryClick(cat.label)} 
                          className={`w-full text-left p-5 rounded-[24px] border transition-all ${selectedCategory === cat.label ? 'bg-white border-blue-400 shadow-md ring-4 ring-blue-50' : 'bg-white border-slate-100 hover:border-blue-200'}`}>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: cat.color }} />
                        <span className="font-bold text-slate-800">{cat.label}</span>
                      </div>
                      <span className="font-black" style={{ color: cat.color }}>{cat.score}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cat.items.slice(0, 8).map((item, i) => (
                        <span key={i} className="text-[9px] bg-slate-50 px-2 py-1 rounded-md text-slate-500 border border-slate-100">
                          {item.name} ({item.distance}m)
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

            </div>
          ) : (
            <div className="py-40 text-center flex flex-col items-center">
                <MapIcon size={64} className="text-slate-200 mb-4" />
                <p className="text-slate-400">Insira um endereço para calcular o score real.</p>
            </div>
          )}
        </main>
        
        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        `}</style>
      </div>
    </div>
  );
};

export default App;