export const lightPlanFixture={
  crewId:'C1',day:60,mission:'mars',version:'circadian-demo-v2',origin:'demo_default',preferences:{wakeTime:'06:30',bedTime:'22:30',autoReview:true},
  deviceConnected:false,exposureAuthorized:false,
  cabinLighting:{phase:'evening',label:'Evening · gradually dimming',targetBrightnessPct:35,targetColorTemperatureK:3000,automatic:true,referenceTime:'2026-11-15T21:00:00Z',config:{wakeTime:'07:00',bedTime:'23:00',autoEnabled:true},deviceConnected:false},
  review:{status:'routine',action:'No automatic review prompt.',reasons:[],metrics:{sleepHours7d:7,moodAvg7d:4,baseOrigin:'synthetic_feed',savedUpdates:0,selfReportedStress:null}},
  schedule:[{day:60,slots:[{kind:'wind_down',title:'Pre-sleep wind-down',start:{day:60,time:'21:00'},end:{day:60,time:'22:30'},mode:'warm',description:'Dim warm ambient lighting; not an exposure dose.'}]}],
  events:[],sources:[],limitations:'Prototype, no light doses or treatment claims.'
};
