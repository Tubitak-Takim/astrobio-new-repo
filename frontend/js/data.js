/* Synthetic design examples, not NASA medical measurements. */
window.ASTROBIO_DATA = (() => {
  const values = {
    bis:[548,546,547,548,547,545,540,535,526,520,511,503],
    heart:[79,78,80,80,81,80,82,83,85,89,93,96],
    spo2:[98,98,97,98,98,97,97,98,97,97,97,97],
    temperature:[36.5,36.5,36.6,36.6,36.5,36.6,36.7,36.6,36.7,36.7,36.8,36.8],
    sleep:[7.8,7.7,7.6,7.7,7.6,7.6,7.3,7.1,6.9,6.7,6.4,6.1],
    co2:[740,770,790,805,830,850,880,910,935,960,1005,1050],
    radiation:[2.2,4.1,6.7,9.0,11.4,13.9,16.2,18.7,21.1,23.5,26.0,28.4],
  };
  const demo=Array.from({length:12},(_,i)=>({day:`Day ${i+1}`,index:i+1,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v[i]])),quality:i===7?'Weak signal':'Good'}));
  const missionModes={
    leo:{name:'LEO',place:'LOW EARTH ORBIT',delay:'< 1 second',work:'Live monitoring',report:'Live ground team sharing',color:'#18dbff',planet:'EARTH',asset:'assets/leo.jpg'},
    moon:{name:'Moon',place:'MOON',delay:'≈ 1.3 seconds',work:'Near real time',report:'Short-delay data sharing',color:'#b69afb',planet:'MOON',asset:'assets/moon.jpeg'},
    mars:{name:'Mars',place:'MARS',delay:'≈ 20 minutes',work:'Autonomous (Mars)',report:'Autonomous + store and forward',color:'#ffad46',planet:'MARS',asset:'assets/mars.jpeg'},
  };
  const anatomyRegions={
    head:{name:'Head and Face',icon:'mdi:head-outline',system:'Neurological / Visual',desc:'A regional view for head, balance, vision and cognitive monitoring. No regional sensor data is available in this prototype.',metrics:[['Eye pressure','Awaiting data'],['Attention test','Demo placeholder'],['Sleep quality','Daily record']]},
    chest:{name:'Chest',icon:'mdi:lungs',system:'Cardiopulmonary',desc:'A regional presentation of heart and respiratory indicators.',metrics:[['Heart rate','96 bpm'],['SpO₂','97%'],['Respiratory data','Awaiting data']]},
    abdomen:{name:'Abdomen',icon:'mdi:stomach',system:'Metabolic',desc:'A visual area for digestive, nutritional and metabolic indicators.',metrics:[['Nutrition log','Awaiting data'],['Fluid balance','Not validated'],['BIS','Whole-body demo']]},
    arms:{name:'Arms',icon:'mdi:arm-flex',system:'Muscles / Activity',desc:'A visual overview of muscles and physical activity. No actual muscle measurements are performed.',metrics:[['Activity','Awaiting data'],['Muscle analysis','Demo placeholder'],['Exercise','Planning']]},
    legs:{name:'Legs',icon:'mdi:bone',system:'Muscles / Bones',desc:'A placeholder for future lower-limb and mobility indicators.',metrics:[['Activity','Awaiting data'],['Bone density','Not measured'],['Exercise adherence','Awaiting data']]},
  };
  const categories=[
    {key:'R',en:'Space Radiation',tr:'Radiation',icon:'mdi:radioactive',color:'#f9b84a',desc:'Radiation Dose',unit:'mSv',value:'28.4',text:'Synthetic cumulative dose'},
    {key:'I',en:'Isolation & Confinement',tr:'Isolation',icon:'mdi:weather-night',color:'#b89aff',desc:'Sleep Duration',unit:'hours',value:'6.1',text:'Sleep duration in the last 24 hours'},
    {key:'D',en:'Distance from Earth',tr:'Distance',icon:'mdi:satellite-uplink',color:'#18d9ff',desc:'Communication Delay',unit:'',value:'≈ 20 minutes',text:'Simulation based on the selected mission'},
    {key:'G',en:'Gravity Fields',tr:'Gravity',icon:'mdi:human',color:'#ff986b',desc:'BIS Fluid Shift Monitoring',unit:'',value:'Review',text:'Synthetic impedance trend'},
    {key:'E',en:'Hostile/Closed Environments',tr:'Environment',icon:'mdi:cloud-outline',color:'#44d9c0',desc:'Cabin Air Quality',unit:'ppm',value:'1050',text:'Synthetic cabin CO₂ level'},
  ];
  return {demo,missionModes,anatomyRegions,categories};
})();
