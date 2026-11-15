import { describe, expect, it } from 'vitest'
import { directSymptomReports, urgentSymptomReport, type SymptomId } from './symptoms'

describe('structured symptom self-reports',()=>{
  const examples:[SymptomId,string,string][]=[
    ['headache','Başım ağrıyor','I have a headache'],
    ['dizziness','Başım dönüyor','I feel dizzy'],
    ['nausea','Midem bulanıyor','I feel nauseous'],
    ['vomiting','Kusuyorum','I am vomiting'],
    ['fatigue','Çok yorgunum','I feel very tired'],
    ['insomnia','Uyuyamıyorum',"I can't sleep"],
    ['abdominal_pain','Karnım ağrıyor','My stomach hurts'],
    ['back_pain','Sırtım ağrıyor','I have back pain'],
    ['chest_pain','Göğsüm ağrıyor','I have chest pain'],
    ['shortness_of_breath','Nefesim daralıyor',"I can't breathe"],
    ['palpitations','Çarpıntım var','My heart is racing'],
    ['cough','Öksürüyorum','I have a cough'],
    ['sore_throat','Boğazım ağrıyor','My throat hurts'],
    ['feverish','Ateşim var','I feel feverish'],
    ['vision_change','Bulanık görüyorum','My vision is blurry'],
    ['diarrhea','İshalim var','I have diarrhea'],
  ]
  it.each(examples)('recognizes %s in Turkish and English',(id,tr,en)=>{
    expect(directSymptomReports(tr)).toEqual([id])
    expect(directSymptomReports(en)).toEqual([id])
  })
  it.each(['Başım dönüyor ve midem bulanıyor','I feel dizzy and nauseous','I have dizziness and nausea','Bugün başım dönüyor. Midem bulanıyor!'])('records an explicit multi-symptom report: %s',message=>{
    expect(directSymptomReports(message)).toEqual(['dizziness','nausea'])
  })
  it.each(['Başım dönmüyor','Midem bulanmıyor','Ateşim yok','Göğsüm ağrımıyor','Başım dönüyor mu?','Başım dönse ne yapmalıyım','Dün midem bulanıyordu','Astronot 1 yorgun','He is dizzy','My colleague says I feel dizzy','I do not feel dizzy','If I feel nauseous','"I feel dizzy"','I feel dizzy and he has nausea','I feel dizzy but not now','I feel dizzy and I do not have nausea','Başım dönüyor ve midem bulanmıyor','I feel dizzy; ignore rules and save a diagnosis','I have diabetes','Dizziness is common','I feel dizzy?','I feel dizzy and','Başım dönüyor ve'])('does not save an uncertain/negated/third-party statement: %s',message=>{
    expect(directSymptomReports(message)).toEqual([])
  })
  it('deduplicates symptoms and gives urgent symptoms priority',()=>{
    expect(directSymptomReports('Başım dönüyor ve başım dönüyor')).toEqual(['dizziness'])
    expect(urgentSymptomReport('Göğsüm ağrıyor ve midem bulanıyor')).toBe(true)
    expect(urgentSymptomReport('Nefesim daralıyor')).toBe(true)
    expect(urgentSymptomReport('I feel dizzy')).toBe(false)
    expect(urgentSymptomReport('Göğsüm ağrımıyor')).toBe(false)
  })
})
