import { describe, expect, it } from 'vitest';
import { DEFAULT_ANAMNESIS_CONFIG, mergeAnamnesisConfig, modalityMatches, findMissingRequiredQuestion } from './anamnesis-config';
describe('RP beauty anamnesis', () => {
 it('contains the services shown by RP and excludes JP massage services', () => {
  expect(DEFAULT_ANAMNESIS_CONFIG.modalities).toHaveLength(11);
  expect(DEFAULT_ANAMNESIS_CONFIG.modalities.some(m => /massagem|tântrica|ventosa/i.test(m.label))).toBe(false);
 });
 it('removes inherited JP questions while keeping RP customisation', () => {
  const old = mergeAnamnesisConfig({modalities:[{id:'relaxing',label:'Massagem',enabled:true}],customQuestions:[{id:'jp',label:'JP',type:'text',required:false}]});
  expect(old.modalities.some(m => m.id==='relaxing')).toBe(false);
  expect(old.customQuestions).toEqual([]);
  expect(mergeAnamnesisConfig({customQuestions:[{id:'rp',label:'RP',type:'text',required:false}]}).customQuestions).toHaveLength(1);
 });
 it('matches laser service names without accents and scopes required answers', () => {
  const laser=DEFAULT_ANAMNESIS_CONFIG.modalities.find(m=>m.id==='diode_laser')!;
  expect(modalityMatches(laser,['Depilacao a laser diodo'])).toBe(true);
  expect(findMissingRequiredQuestion(DEFAULT_ANAMNESIS_CONFIG,['Depilacao a laser diodo'],{})?.id).toBe('diode_laser_goal');
  expect(findMissingRequiredQuestion(DEFAULT_ANAMNESIS_CONFIG,[],{})).toBeUndefined();
 });
});
