// Self-reported symptoms, never inferred diagnoses or measured vital signs.
export const SYMPTOMS = {
  headache:{en:'headache',tr:'baş ağrısı'},
  dizziness:{en:'dizziness',tr:'baş dönmesi'},
  nausea:{en:'nausea',tr:'bulantı'},
  vomiting:{en:'vomiting',tr:'kusma'},
  fatigue:{en:'fatigue',tr:'yorgunluk'},
  insomnia:{en:'sleep difficulty',tr:'uyku sorunu'},
  abdominal_pain:{en:'abdominal pain',tr:'karın ağrısı'},
  back_pain:{en:'back pain',tr:'sırt ağrısı'},
  chest_pain:{en:'chest pain',tr:'göğüs ağrısı'},
  shortness_of_breath:{en:'shortness of breath',tr:'nefes darlığı'},
  palpitations:{en:'palpitations',tr:'çarpıntı'},
  cough:{en:'cough',tr:'öksürük'},
  sore_throat:{en:'sore throat',tr:'boğaz ağrısı'},
  feverish:{en:'feeling feverish (unmeasured)',tr:'ateş hissi (ölçülmemiş)'},
  vision_change:{en:'vision change',tr:'görme değişikliği'},
  diarrhea:{en:'diarrhea',tr:'ishal'},
} as const
export type SymptomId = keyof typeof SYMPTOMS
export const isSymptomId = (value:unknown):value is SymptomId => typeof value==='string' && Object.hasOwn(SYMPTOMS,value)

const patterns:Record<SymptomId,RegExp> = {
  headache:/^(?:basim (?:cok |hafif |biraz |siddetli )?agriyor|bas agrim var|i have (?:a |a mild |a bad |a severe )?headache|my head hurts)$/,
  dizziness:/^(?:basim (?:cok |biraz )?donuyor|bas donmem var|bas donmesi yasiyorum|i (?:am|feel) (?:very |a little )?dizzy|i have dizziness)$/,
  nausea:/^(?:midem bulaniyor|mide bulantim var|mide bulantisi yasiyorum|i (?:am|feel) nauseous|i have nausea)$/,
  vomiting:/^(?:kusuyorum|i am vomiting)$/,
  fatigue:/^(?:(?:cok |biraz )?yorgunum|kendimi yorgun hissediyorum|halsizim|i (?:am|feel) (?:very )?(?:tired|fatigued|exhausted)|i have fatigue)$/,
  insomnia:/^(?:uyuyamiyorum|uyku sorunum var|uyumakta zorlaniyorum|uykusuzluk cekiyorum|i (?:cannot|can't) sleep|i have (?:trouble sleeping|difficulty sleeping|insomnia))$/,
  abdominal_pain:/^(?:(?:karnim|midem) (?:cok |hafif |siddetli )?agriyor|karin agrim var|i have (?:abdominal|stomach) pain|my stomach hurts)$/,
  back_pain:/^(?:(?:sirtim|belim) agriyor|(?:sirt|bel) agrim var|i have back pain|my back hurts)$/,
  chest_pain:/^(?:gogsum agriyor|gogus agrim var|i have chest pain|my chest hurts)$/,
  shortness_of_breath:/^(?:nefesim daraliyor|nefes darligim var|nefes almakta zorlaniyorum|nefes alamiyorum|i am short of breath|i (?:cannot|can't) breathe|i have shortness of breath)$/,
  palpitations:/^(?:carpintim var|kalbim carpiyor|i have palpitations|my heart is racing)$/,
  cough:/^(?:oksuruyorum|oksurugum var|i am coughing|i have a cough)$/,
  sore_throat:/^(?:bogazim agriyor|bogaz agrim var|i have a sore throat|my throat hurts)$/,
  feverish:/^(?:atesim var|kendimi atesli hissediyorum|i (?:am|feel) feverish|i have a fever)$/,
  vision_change:/^(?:bulanik goruyorum|gormem bulanik|gormemde degisiklik var|i have (?:blurred|blurry) vision|my vision is (?:blurred|blurry))$/,
  diarrhea:/^(?:ishalim|ishalim var|i have diarrh(?:ea|oea))$/,
}

export function directSymptomReports(message:string):SymptomId[] {
  const value=message.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/’/g,"'").replace(/\bi'm\b/g,'i am').trim().replace(/[.!]+$/,'').trim()
  // Every clause must be an explicit, supported first-person statement. Do not
  // salvage a positive fragment from negated, quoted or otherwise mixed prose.
  const clauses=value.split(/\s+(?:ve|and)\s+|\s*[,;]\s*|\.\s+/)
  if(clauses.length>8 || clauses.some(c=>!c))return []
  const found:SymptomId[]=[]
  const sharedEnglishPrefix=value.match(/^(i have |i feel |i am )/)?.[1]
  for(const clause of clauses) {
    const normalized=clause.replace(/^(?:su anda |bugun )/,'').replace(/ (?:right now|today)$/,'')
    const candidates=[normalized,...(sharedEnglishPrefix?[sharedEnglishPrefix+normalized]:[])]
    const id=(Object.keys(patterns) as SymptomId[]).find(id=>candidates.some(candidate=>patterns[id].test(candidate)))
    if(!id)return []
    found.push(id)
  }
  return [...new Set(found)]
}

export const urgentSymptomReport = (message:string) => directSymptomReports(message).some(id=>id==='chest_pain'||id==='shortness_of_breath')
