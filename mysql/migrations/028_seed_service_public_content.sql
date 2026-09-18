UPDATE clinic_services
SET
  public_presentation = CASE name
    WHEN 'Esfoliação Corporal' THEN 'Um cuidado corporal pensado para renovar a textura da pele e proporcionar uma sensação suave e cuidada.'
    WHEN 'Massagem Nuru' THEN 'Uma experiência de massagem sensorial, realizada com atenção ao conforto, privacidade e preferências individuais.'
    WHEN 'Massagem Pedras Quentes' THEN 'Uma massagem de relaxamento que utiliza o calor confortável das pedras como complemento às manobras manuais.'
    WHEN 'Massagem Relaxante' THEN 'Uma pausa de bem-estar com ritmo calmo e pressão adaptada, pensada para aliviar o cansaço do dia a dia.'
    WHEN 'Massagem Velas Quentes' THEN 'Uma experiência envolvente com óleo morno de massagem, criada para favorecer conforto e uma sensação de cuidado.'
    WHEN 'Reflexologia Podal' THEN 'Um cuidado focado nos pés, com manobras de pressão e relaxamento adaptadas à sua sensibilidade.'
    WHEN 'Spa dos Pés' THEN 'Um ritual de cuidado e conforto para os pés, ideal para quem procura uma pausa leve e revitalizante.'
    WHEN 'Ventosa terapia' THEN 'Técnica complementar realizada após avaliação, com aplicação cuidadosa de ventosas conforme a tolerância individual.'
    WHEN 'Corte de Cabelo' THEN 'Corte personalizado, pensado para valorizar o seu estilo, rotina e preferência de manutenção.'
    WHEN 'Depilação a Cera' THEN 'Serviço de depilação com preparação e cuidados adequados à zona tratada e ao tipo de pele.'
    WHEN 'Depilação a Creme' THEN 'Alternativa de depilação com creme próprio, avaliada de acordo com a sensibilidade da pele.'
    WHEN 'Depilação Íntima Cera ou Stripping' THEN 'Serviço íntimo realizado com privacidade, higiene e técnica escolhida de acordo com a sua preferência.'
    WHEN 'Depilação Masculina' THEN 'Depilação adaptada às zonas e características da pele masculina, com atenção ao conforto.'
    WHEN 'Depilação Nariz e Orelha' THEN 'Cuidado rápido e preciso para remover pelos das zonas do nariz e orelhas.'
    WHEN 'Design de Sobrancelhas' THEN 'Desenho e definição de sobrancelhas para valorizar a expressão natural do rosto.'
    WHEN 'Design de Sobrancelhas com Henna' THEN 'Design personalizado com aplicação de henna para reforçar temporariamente a definição das sobrancelhas.'
    WHEN 'Limpeza Facial' THEN 'Cuidado facial de limpeza e frescura, adaptado às necessidades observadas no momento do atendimento.'
    WHEN 'Limpeza Facial Profunda' THEN 'Ritual facial mais completo, focado na limpeza, conforto e aparência cuidada da pele.'
    WHEN 'Massagem 4Mãos Nuru' THEN 'Experiência sensorial coordenada por dois profissionais, com atenção constante ao conforto e aos limites definidos.'
    WHEN 'Massagem 4Mãos Relaxante' THEN 'Massagem realizada por dois profissionais para uma experiência envolvente de relaxamento e desconexão.'
    WHEN 'Massagem 4Mãos Sensitiva' THEN 'Experiência a quatro mãos adaptada ao seu conforto, com comunicação clara e respeito pelos limites estabelecidos.'
    WHEN 'Massagem Desportiva' THEN 'Massagem orientada para quem tem uma rotina fisicamente exigente e procura recuperação e conforto muscular.'
    WHEN 'Massagem Lomi-Lomi' THEN 'Massagem de inspiração havaiana, com movimentos amplos e fluidos para uma experiência de relaxamento contínuo.'
    WHEN 'Massagem Modeladora' THEN 'Massagem corporal com manobras mais dinâmicas, realizada após avaliação e de acordo com a sua sensibilidade.'
    WHEN 'Massagem Redutora de Medidas' THEN 'Cuidado corporal com abordagem personalizada, integrado numa rotina de bem-estar e hábitos saudáveis.'
    WHEN 'Massagem Sensitiva' THEN 'Experiência de toque consciente e relaxamento, sempre conduzida com comunicação, consentimento e respeito.'
    WHEN 'Massagem Sensorial' THEN 'Uma experiência de bem-estar que combina ambiente, ritmo e toque para estimular os sentidos com conforto.'
    WHEN 'Massagem Tântrica' THEN 'Experiência de bem-estar baseada em presença, respiração e relaxamento, realizada com limites e consentimento claros.'
    WHEN 'Massagem Tântrica/Sensitiva' THEN 'Sessão personalizada que privilegia presença, comunicação e conforto, dentro dos limites previamente definidos.'
    WHEN 'Massagem Terapêutica' THEN 'Massagem adaptada às zonas de maior tensão e às necessidades relatadas, sem substituir aconselhamento clínico.'
    WHEN 'Stripping Total' THEN 'Depilação por stripping com preparação adequada, técnica cuidadosa e orientação de cuidados posteriores.'
    WHEN 'Tratamento Anti-envelhecimento' THEN 'Cuidado estético facial focado na hidratação, conforto e aparência cuidada da pele.'
    ELSE public_presentation END,
  public_benefits = CASE
    WHEN name LIKE 'Massagem%' THEN JSON_ARRAY('Momento de relaxamento e bem-estar','Pressão e ritmo adaptados à sua preferência','Ambiente cuidado e atendimento personalizado')
    WHEN name LIKE 'Depilação%' OR name = 'Stripping Total' THEN JSON_ARRAY('Pele com aspeto cuidado','Técnica adaptada à zona tratada','Orientação de cuidados após o serviço')
    WHEN name LIKE '%Sobrancelhas%' THEN JSON_ARRAY('Definição do olhar','Desenho adaptado ao rosto','Acabamento cuidado')
    WHEN name LIKE 'Limpeza Facial%' OR name = 'Tratamento Anti-envelhecimento' THEN JSON_ARRAY('Sensação de pele limpa e cuidada','Rotina adaptada ao momento da pele','Momento de autocuidado')
    WHEN name IN ('Esfoliação Corporal','Spa dos Pés') THEN JSON_ARRAY('Sensação de renovação e conforto','Cuidado direcionado à zona tratada','Momento de bem-estar')
    WHEN name = 'Corte de Cabelo' THEN JSON_ARRAY('Corte adaptado ao seu estilo','Orientação de manutenção','Acabamento personalizado')
    ELSE JSON_ARRAY('Atendimento personalizado','Conforto durante a sessão','Orientação antes e depois do serviço') END,
  public_considerations = CASE
    WHEN name LIKE 'Massagem%' OR name IN ('Ventosa terapia','Reflexologia Podal') THEN JSON_ARRAY('Informe-nos sobre gravidez, lesões, dor recente ou condição de saúde relevante','Avise se estiver com febre, infeção de pele ou desconforto no dia','A intensidade é sempre ajustada ao seu conforto')
    WHEN name LIKE 'Depilação%' OR name = 'Stripping Total' THEN JSON_ARRAY('Informe-nos sobre alergias, irritação ou tratamentos dermatológicos','Evite exposição solar intensa e esfoliação na zona após o serviço','Não realizar sobre pele ferida ou irritada')
    WHEN name LIKE 'Limpeza Facial%' OR name = 'Tratamento Anti-envelhecimento' THEN JSON_ARRAY('Informe-nos sobre alergias, pele sensibilizada ou tratamentos em curso','A avaliação da pele é feita antes do atendimento','Siga as recomendações de cuidados posteriores')
    ELSE JSON_ARRAY('Informe-nos sobre alergias, sensibilidades ou condições relevantes','O serviço é adaptado à sua tolerância e conforto','Em caso de dúvida, fale connosco antes de marcar') END,
  public_image_url = CASE WHEN name LIKE 'Massagem%' THEN '/service-images/massagem-wellness.png' ELSE public_image_url END
WHERE name IN ('Esfoliação Corporal','Massagem Nuru','Massagem Pedras Quentes','Massagem Relaxante','Massagem Velas Quentes','Reflexologia Podal','Spa dos Pés','Ventosa terapia','Corte de Cabelo','Depilação a Cera','Depilação a Creme','Depilação Íntima Cera ou Stripping','Depilação Masculina','Depilação Nariz e Orelha','Design de Sobrancelhas','Design de Sobrancelhas com Henna','Limpeza Facial','Limpeza Facial Profunda','Massagem 4Mãos Nuru','Massagem 4Mãos Relaxante','Massagem 4Mãos Sensitiva','Massagem Desportiva','Massagem Lomi-Lomi','Massagem Modeladora','Massagem Redutora de Medidas','Massagem Sensitiva','Massagem Sensorial','Massagem Tântrica','Massagem Tântrica/Sensitiva','Massagem Terapêutica','Stripping Total','Tratamento Anti-envelhecimento');
