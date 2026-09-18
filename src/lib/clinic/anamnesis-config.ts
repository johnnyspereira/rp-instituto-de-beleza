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

export const DEFAULT_ANAMNESIS_CONFIG: AnamnesisFormConfig = {
  modalities: [
    { id: "skin_cleansing", label: "Limpeza de pele", enabled: true, aliases: ["limpeza facial"], questions: [
      long("skin_cleansing_goal", "Como descreve a sua pele e qual o objetivo da sessão?", true),
      long("skin_cleansing_history", "Indique cosméticos, medicamentos e procedimentos de pele recentes.", true),
      yesNo("skin_cleansing_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "diode_laser", label: "Depilação a laser díodo", enabled: true, aliases: ["laser díodo","laser diodo","depilação a laser diodo"], questions: [
      long("diode_laser_goal", "Quais zonas pretende tratar e como remove atualmente os pelos?", true),
      long("diode_laser_history", "Indique exposição solar, bronzeamento, tatuagens, medicamentos e procedimentos recentes.", true),
      yesNo("diode_laser_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
      yesNo('laser_sun_recent', 'Teve exposição solar, bronzeamento ou queimaduras recentes?', true),
      long('laser_medications', 'Indique todos os medicamentos e suplementos, incluindo tratamentos para acne.', true),
    ] },
    { id: "plaster_therapy", label: "Gessoterapia", enabled: true, aliases: ["gesso terapia"], questions: [
      long("plaster_therapy_goal", "Quais zonas pretende trabalhar e qual o objetivo?", true),
      long("plaster_therapy_history", "Indique problemas circulatórios, intervenções recentes e recomendações profissionais relevantes.", true),
      yesNo("plaster_therapy_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "jet_bronze", label: "JetBronze", enabled: true, aliases: ["jet bronze","bronzeamento a jato"], questions: [
      long("jet_bronze_goal", "Qual o resultado pretendido e a data prevista para o serviço?", true),
      long("jet_bronze_history", "Indique reações anteriores a bronzeadores e procedimentos de pele recentes.", true),
      yesNo("jet_bronze_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
      long('bronze_breathing', 'Indique asma, sensibilidade respiratória ou reações anteriores a aerossóis.'),
    ] },
    { id: "gel_nails", label: "Unhas de gel", enabled: true, aliases: ["gel"], questions: [
      long("gel_nails_goal", "Já utiliza gel? Descreva o estado das unhas e o resultado pretendido.", true),
      long("gel_nails_history", "Indique alergias a acrilatos, adesivos e produtos para unhas ou reações anteriores.", true),
      yesNo("gel_nails_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "acrylic_nails", label: "Unhas de acrílico", enabled: true, aliases: ["acrílico","acrilico"], questions: [
      long("acrylic_nails_goal", "Descreva aplicações anteriores, o estado das unhas e o resultado pretendido.", true),
      long("acrylic_nails_history", "Indique alergias a acrilatos, adesivos e produtos para unhas ou reações anteriores.", true),
      yesNo("acrylic_nails_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "gel_polish", label: "Gelinho", enabled: true, aliases: ["verniz gel"], questions: [
      long("gel_polish_goal", "Descreva o estado atual das unhas e o resultado pretendido.", true),
      long("gel_polish_history", "Indique alergias a produtos para unhas e reações anteriores.", true),
      yesNo("gel_polish_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "lash_lift", label: "Lifting de pestanas com botox", enabled: true, aliases: ["lifting de pestanas","lash lifting"], questions: [
      long("lash_lift_goal", "Já realizou lifting? Indique tratamentos oculares e reações anteriores.", true),
      long("lash_lift_history", "Indique alergias a cosméticos, utilização de lentes de contacto ou desconforto ocular.", true),
      yesNo("lash_lift_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "lash_extensions", label: "Extensão de pestanas 3D", enabled: true, aliases: ["extensão de pestanas","pestanas 3D"], questions: [
      long("lash_extensions_goal", "Já utilizou extensões? Indique aplicações, remoções e reações anteriores.", true),
      long("lash_extensions_history", "Indique alergias a adesivos, utilização de lentes de contacto ou desconforto ocular.", true),
      yesNo("lash_extensions_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "threading", label: "Threading", enabled: true, aliases: ["depilação com linha"], questions: [
      long("threading_goal", "Qual a zona a tratar e existem sensibilidades anteriores?", true),
      long("threading_history", "Indique produtos, medicamentos e procedimentos recentes na zona a tratar.", true),
      yesNo("threading_irritation", 'Existe dor, irritação, infeção, ferida ou sensibilidade na zona a tratar?', true),
    ] },
    { id: "training", label: "Formações/workshops", enabled: true, aliases: ["formações","workshops","formação profissional"], questions: [
      long("training_goal", "Qual a formação pretendida e a sua experiência anterior?", true),
      long("training_history", "Participa como formando ou modelo? Como modelo, indique o procedimento e preencha também a ficha desse serviço.", true),
    ] },
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
  const jpIds = new Set(['tantric_sensitive', 'relaxing', 'therapeutic', 'sports', 'hot_stones', 'hot_candles', 'cupping', 'reflexology', 'myofascial', 'tantric', 'sensitive', 'lomi_lomi', 'nuru', 'slimming', 'lymphatic', 'lymphatic_drainage', 'drainage', 'sensory', 'modeling', 'heat', 'aesthetics']);
  const storedModalities = isLegacyGroupedConfig ? [] : incomingModalities.filter((modality) => !jpIds.has(modality.id));
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
    customQuestions: (incomingModalities.some((modality) => jpIds.has(modality.id)) ? [] : stored?.customQuestions || []).filter(
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
