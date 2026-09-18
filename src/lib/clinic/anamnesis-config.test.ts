import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANAMNESIS_CONFIG,
  findMissingRequiredQuestion,
  mergeAnamnesisConfig,
  modalityMatches,
} from '@/lib/clinic/anamnesis-config';

describe('anamnesis modality configuration', () => {
  it('provides an individual clinical block for every configured modality', () => {
    expect(DEFAULT_ANAMNESIS_CONFIG.modalities).toHaveLength(15);
    expect(
      DEFAULT_ANAMNESIS_CONFIG.modalities.every(
        (modality) => (modality.questions || []).length >= 2
      )
    ).toBe(true);
  });

  it('replaces the legacy grouped catalog without losing custom questions', () => {
    const merged = mergeAnamnesisConfig({
      modalities: [
        { id: 'relaxing', label: 'Relaxante ou sensorial', enabled: true },
        {
          id: 'therapeutic',
          label: 'Terapêutica ou desportiva',
          enabled: true,
        },
        { id: 'heat', label: 'Pedras ou velas', enabled: true },
        { id: 'aesthetics', label: 'Estética', enabled: true },
      ],
      customQuestions: [
        {
          id: 'clinic_note',
          label: 'Observação da clínica',
          type: 'textarea',
          required: false,
        },
      ],
    });

    expect(merged.modalities).toHaveLength(15);
    expect(merged.modalities.some((modality) => modality.id === 'heat')).toBe(
      false
    );
    expect(merged.customQuestions).toHaveLength(1);
  });

  it('matches service names from the agenda without depending on accents', () => {
    const therapeutic = DEFAULT_ANAMNESIS_CONFIG.modalities.find(
      (modality) => modality.id === 'therapeutic'
    )!;
    const combined = DEFAULT_ANAMNESIS_CONFIG.modalities.find(
      (modality) => modality.id === 'tantric_sensitive'
    )!;
    const tantric = DEFAULT_ANAMNESIS_CONFIG.modalities.find(
      (modality) => modality.id === 'tantric'
    )!;

    expect(modalityMatches(therapeutic, ['Massagem Terapeutica'])).toBe(true);
    expect(modalityMatches(combined, ['Massagem Tântrica/Sensitiva'])).toBe(
      true
    );
    expect(modalityMatches(tantric, ['Massagem Tântrica/Sensitiva'])).toBe(
      false
    );
  });

  it('requires only questions belonging to the selected modality', () => {
    const missing = findMissingRequiredQuestion(
      DEFAULT_ANAMNESIS_CONFIG,
      ['Massagem Desportiva'],
      {}
    );
    expect(missing?.id).toBe('sports_activity');

    const complete = findMissingRequiredQuestion(
      DEFAULT_ANAMNESIS_CONFIG,
      ['Massagem Desportiva'],
      { modality_sports_activity: 'Corrida, recuperação muscular' }
    );
    expect(complete).toBeUndefined();
  });
});
