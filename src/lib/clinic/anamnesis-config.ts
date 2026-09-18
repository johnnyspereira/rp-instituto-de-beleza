export type AnamnesisQuestionType = 'text' | 'textarea' | 'yes_no' | 'body_map';

export type AnamnesisQuestion = {
  id: string;
  label: string;
  type: AnamnesisQuestionType;
  required: boolean;
};

export type AnamnesisModality = {
  id: string;
  label: string;
  enabled: boolean;
  aliases?: string[];
  questions?: AnamnesisQuestion[];
};

export type AnamnesisFormConfig = {
  modalities: AnamnesisModality[];
  customQuestions: AnamnesisQuestion[];
};

const yesNo = (
  id: string,
  label: string,
  required = false
): AnamnesisQuestion => ({
  id,
  label,
  type: 'yes_no',
  required,
});

const long = (
  id: string,
  label: string,
  required = false
): AnamnesisQuestion => ({
  id,
  label,
  type: 'textarea',
  required,
});

const bodyMap = (
  id: string,
  label: string,
  required = false
): AnamnesisQuestion => ({
  id,
  label,
  type: 'body_map',
  required,
});

export const DEFAULT_ANAMNESIS_CONFIG: AnamnesisFormConfig = {
  modalities: [
    {
      id: 'tantric_sensitive',
      label: 'Massagem Tântrica/Sensitiva',
      enabled: true,
      aliases: ['tântrica/sensitiva', 'tantrica/sensitiva'],
      questions: [
        yesNo(
          'tantric_sensitive_first',
          'É a sua primeira experiência nesta modalidade?',
          true
        ),
        long(
          'tantric_sensitive_boundaries',
          'Indique limites, zonas que não autoriza tocar e preferências de conforto.',
          true
        ),
        yesNo(
          'tantric_sensitive_skin',
          'Possui irritação, infeção, lesão cutânea ou sensibilidade a óleos?'
        ),
      ],
    },
    {
      id: 'relaxing',
      label: 'Massagem Relaxante',
      enabled: true,
      aliases: ['relaxante'],
      questions: [
        bodyMap(
          'relaxing_avoid',
          'Existem zonas dolorosas, sensíveis ou que devem ser evitadas?'
        ),
        yesNo(
          'relaxing_oils',
          'Possui alergia ou sensibilidade a óleos, cremes ou fragrâncias?'
        ),
      ],
    },
    {
      id: 'therapeutic',
      label: 'Massagem Terapêutica',
      enabled: true,
      aliases: ['terapêutica', 'terapeutica'],
      questions: [
        long(
          'therapeutic_pain',
          'Localize a dor, indique a intensidade de 0 a 10 e há quanto tempo começou.',
          true
        ),
        long(
          'therapeutic_diagnosis',
          'Possui diagnóstico, exames, cirurgia recente ou recomendação médica?'
        ),
        long(
          'therapeutic_mobility',
          'Que movimentos ou atividades estão limitados?'
        ),
      ],
    },
    {
      id: 'sports',
      label: 'Massagem Desportiva',
      enabled: true,
      aliases: ['desportiva'],
      questions: [
        long(
          'sports_activity',
          'Qual desporto pratica, com que frequência e qual o objetivo da sessão?',
          true
        ),
        long(
          'sports_injury',
          'Possui lesão atual, dor aguda, edema ou está em recuperação?'
        ),
        yesNo(
          'sports_event',
          'Tem treino ou competição nas próximas 48 horas?'
        ),
      ],
    },
    {
      id: 'hot_stones',
      label: 'Massagem Pedras Quentes',
      enabled: true,
      aliases: ['pedras quentes'],
      questions: [
        yesNo(
          'stones_heat',
          'Possui sensibilidade reduzida ou intolerância ao calor?',
          true
        ),
        yesNo(
          'stones_circulation',
          'Possui diabetes, varizes, trombose ou problemas circulatórios?'
        ),
        long(
          'stones_skin',
          'Indique inflamações, lesões cutâneas ou zonas onde não deve ser aplicado calor.'
        ),
      ],
    },
    {
      id: 'hot_candles',
      label: 'Massagem Velas Quentes',
      enabled: true,
      aliases: ['velas quentes'],
      questions: [
        yesNo(
          'candles_allergy',
          'Possui alergia a cosméticos, fragrâncias, ceras ou óleos?',
          true
        ),
        yesNo(
          'candles_heat',
          'Possui sensibilidade reduzida ou intolerância ao calor?'
        ),
        long(
          'candles_skin',
          'Indique dermatites, feridas, irritações ou tratamentos de pele recentes.'
        ),
      ],
    },
    {
      id: 'cupping',
      label: 'Ventosaterapia',
      enabled: true,
      aliases: ['ventosaterapia', 'ventosa'],
      questions: [
        yesNo(
          'cupping_anticoagulant',
          'Utiliza anticoagulantes ou apresenta hematomas com facilidade?',
          true
        ),
        yesNo(
          'cupping_skin',
          'Possui feridas, varizes salientes, infeções ou inflamação na zona a tratar?'
        ),
        yesNo(
          'cupping_marks',
          'Compreende e aceita que a técnica pode deixar marcas temporárias?',
          true
        ),
      ],
    },
    {
      id: 'reflexology',
      label: 'Reflexologia Podal',
      enabled: true,
      aliases: ['reflexologia podal', 'reflexologia'],
      questions: [
        yesNo(
          'reflexology_feet',
          'Possui feridas, infeção, micose, fratura ou cirurgia recente nos pés?',
          true
        ),
        yesNo(
          'reflexology_neuropathy',
          'Possui diabetes, neuropatia ou perda de sensibilidade nos pés?'
        ),
        yesNo(
          'reflexology_pregnancy',
          'Está grávida ou existe possibilidade de gravidez?'
        ),
      ],
    },
    {
      id: 'myofascial',
      label: 'Liberação Miofascial',
      enabled: true,
      aliases: ['liberação miofascial', 'liberacao miofascial', 'miofascial'],
      questions: [
        long(
          'myofascial_restriction',
          'Indique a zona de restrição, dor e movimentos limitados.',
          true
        ),
        yesNo(
          'myofascial_injury',
          'Possui lesão aguda, fratura, cirurgia recente ou doença do tecido conjuntivo?'
        ),
        long(
          'myofascial_treatment',
          'Realiza fisioterapia ou outro acompanhamento para esta condição?'
        ),
      ],
    },
    {
      id: 'tantric',
      label: 'Massagem Tântrica',
      enabled: true,
      aliases: ['massagem tântrica', 'massagem tantrica'],
      questions: [
        yesNo(
          'tantric_first',
          'É a sua primeira experiência nesta modalidade?',
          true
        ),
        long(
          'tantric_boundaries',
          'Indique claramente os seus limites, zonas excluídas e preferências.',
          true
        ),
        yesNo(
          'tantric_consent',
          'Compreende que pode interromper ou ajustar a sessão a qualquer momento?',
          true
        ),
      ],
    },
    {
      id: 'sensitive',
      label: 'Massagem Sensitiva',
      enabled: true,
      aliases: ['massagem sensitiva'],
      questions: [
        long(
          'sensitive_boundaries',
          'Indique limites de toque, zonas excluídas e sensibilidades.',
          true
        ),
        long(
          'sensitive_goal',
          'O que procura nesta sessão e o que ajuda a sentir-se confortável?'
        ),
        yesNo(
          'sensitive_oils',
          'Possui alergia ou sensibilidade a óleos e fragrâncias?'
        ),
      ],
    },
    {
      id: 'lomi_lomi',
      label: 'Massagem Lomi-Lomi',
      enabled: true,
      aliases: ['lomi-lomi', 'lomi lomi'],
      questions: [
        yesNo(
          'lomi_oils',
          'Possui alergia ou sensibilidade a óleos e fragrâncias?'
        ),
        bodyMap(
          'lomi_avoid',
          'Existem zonas dolorosas, sensíveis ou que devem ser evitadas?'
        ),
        yesNo(
          'lomi_mobility',
          'Possui limitação de mobilidade, cirurgia ou lesão recente?'
        ),
      ],
    },
    {
      id: 'nuru',
      label: 'Massagem Nuru',
      enabled: true,
      aliases: ['massagem nuru', 'nuru'],
      questions: [
        yesNo(
          'nuru_skin',
          'Possui alergias, dermatite, feridas ou sensibilidade cutânea?',
          true
        ),
        long(
          'nuru_boundaries',
          'Indique limites, zonas excluídas e qualquer adaptação necessária.',
          true
        ),
        yesNo(
          'nuru_consent',
          'Compreende que pode interromper ou ajustar a sessão a qualquer momento?',
          true
        ),
      ],
    },
    {
      id: 'slimming',
      label: 'Massagem Redutora de Medidas',
      enabled: true,
      aliases: ['redutora de medidas', 'redutora'],
      questions: [
        long(
          'slimming_goal',
          'Quais zonas pretende trabalhar e qual o seu objetivo?'
        ),
        yesNo(
          'slimming_circulation',
          'Possui varizes, trombose, fragilidade capilar ou problemas circulatórios?',
          true
        ),
        yesNo(
          'slimming_surgery',
          'Fez cirurgia, procedimento estético ou teve parto recentemente?'
        ),
      ],
    },
    {
      id: 'modeling',
      label: 'Massagem Modeladora',
      enabled: true,
      aliases: ['modeladora'],
      questions: [
        long(
          'modeling_goal',
          'Quais zonas pretende trabalhar e qual o resultado esperado?'
        ),
        yesNo(
          'modeling_circulation',
          'Possui varizes, trombose, hematomas frequentes ou problemas circulatórios?',
          true
        ),
        yesNo(
          'modeling_skin',
          'Possui inflamação, dor aguda, lesão de pele ou cirurgia recente?'
        ),
      ],
    },
  ],
  customQuestions: [],
};

export function mergeAnamnesisConfig(
  stored?: Partial<AnamnesisFormConfig> | null
): AnamnesisFormConfig {
  const incomingModalities = stored?.modalities || [];
  const legacyGroupedIds = new Set([
    'relaxing',
    'therapeutic',
    'heat',
    'aesthetics',
  ]);
  const isLegacyGroupedConfig =
    incomingModalities.length > 0 &&
    incomingModalities.every(
      (modality) =>
        legacyGroupedIds.has(modality.id) &&
        !modality.aliases?.length &&
        !modality.questions?.length
    );
  const storedModalities = isLegacyGroupedConfig ? [] : incomingModalities;
  const storedById = new Map(
    storedModalities.map((modality) => [modality.id, modality])
  );
  const defaults = DEFAULT_ANAMNESIS_CONFIG.modalities.map((fallback) => ({
    ...fallback,
    ...(storedById.get(fallback.id) || {}),
    questions: (
      storedById.get(fallback.id)?.questions ||
      fallback.questions ||
      []
    ).map((question) =>
      question.id === 'relaxing_avoid'
        ? { ...question, type: 'body_map' as const }
        : question
    ).filter((question) => !isPressureQuestion(question)),
  }));
  const defaultIds = new Set(defaults.map((modality) => modality.id));
  const extraModalities = storedModalities
    .filter((modality) => !defaultIds.has(modality.id))
    .map((modality) => ({
      ...modality,
      questions: (modality.questions || []).filter(
        (question) => !isPressureQuestion(question)
      ),
    }));

  return {
    modalities: [
      ...defaults,
      ...extraModalities,
    ],
    customQuestions: (stored?.customQuestions || []).filter(
      (question) => !isPressureQuestion(question)
    ),
  };
}

// A pressão é média por padrão em todas as modalidades. Esta limpeza também
// remove perguntas antigas guardadas nas definições da conta.
function isPressureQuestion(question: AnamnesisQuestion) {
  return /pressure|pressão|pressao/i.test(`${question.id} ${question.label}`);
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function modalityMatches(
  modality: AnamnesisModality,
  selectedValues: string[]
) {
  const needles = [modality.label, ...(modality.aliases || [])]
    .map(normalize)
    .filter(Boolean);
  return selectedValues.some((selected) => {
    const value = normalize(selected);
    return needles.some((needle) => value === needle);
  });
}

export function questionAnswerKey(question: AnamnesisQuestion, scoped = false) {
  return scoped ? `modality_${question.id}` : `custom_${question.id}`;
}

export function findMissingRequiredQuestion(
  config: AnamnesisFormConfig,
  selectedModalities: string[],
  answers: Record<string, unknown>
) {
  const questions = [
    ...config.customQuestions.map((question) => ({ question, scoped: false })),
    ...config.modalities
      .filter((modality) => modalityMatches(modality, selectedModalities))
      .flatMap((modality) =>
        (modality.questions || []).map((question) => ({
          question,
          scoped: true,
        }))
      ),
  ];
  return questions.find(
    ({ question, scoped }) =>
      question.required &&
      !String(answers[questionAnswerKey(question, scoped)] || '').trim()
  )?.question;
}
