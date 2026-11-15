export const lightPlanFixture={
  crewId:'C1',day:60,mission:'mars',version:'circadian-demo-v1',origin:'demo_default',preferences:{wakeTime:'06:30',bedTime:'22:30',autoReview:true},
  deviceConnected:false,exposureAuthorized:false,
  review:{status:'routine',action:'No automatic review prompt.',reasons:[],metrics:{sleepHours7d:7,moodAvg7d:4,baseOrigin:'synthetic_feed',savedUpdates:0,selfReportedStress:null}},
  schedule:Array.from({length:7},(_,i)=>({day:60+i,slots:[{kind:'wind_down',title:'Pre-sleep wind-down',start:{day:60+i,time:'21:00'},end:{day:60+i,time:'22:30'},mode:'warm',description:'Dim warm ambient lighting; not an exposure dose.'}]})),
  events:[],sources:[],limitations:'Prototype, no light doses or treatment claims.'
};
