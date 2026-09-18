export type LearningArticle = {
  id: string;
  title: string;
  category: string;
  summary: string;
  audience: 'all' | 'staff' | 'client';
  duration: string;
  href?: string;
  purpose: string;
  steps: string[];
  tips: string[];
  related?: string[];
};
export const CRM_LEARNING_ARTICLES: LearningArticle[] = [
  {
    id: 'dashboard',
    title: 'Painel: entenda o seu dia',
    category: 'Começar',
    audience: 'staff',
    duration: '3 min',
    href: '/dashboard',
    summary:
      'Leia indicadores, prioridades e atividades recentes sem se perder.',
    purpose:
      'O Painel reúne o que exige atenção agora: conversas, clientes, negócios e operação.',
    steps: [
      'Confira os cartões de indicadores e compare com o período anterior.',
      'Veja a atividade recente para identificar mudanças importantes.',
      'Use as ações rápidas para ir diretamente à tarefa desejada.',
    ],
    tips: [
      'Um indicador é um sinal para investigar; use Relatórios para análises completas.',
    ],
    related: ['reports', 'inbox'],
  },
  {
    id: 'inbox',
    title: 'Atender pela Caixa de entrada',
    category: 'Atendimento',
    audience: 'staff',
    duration: '5 min',
    href: '/inbox',
    summary: 'Receba, organize, atribua e responda conversas do WhatsApp.',
    purpose:
      'A Caixa de entrada centraliza as conversas e mantém todo o histórico associado ao cliente.',
    steps: [
      'Selecione uma conversa na coluna da esquerda.',
      'Confira o cliente e as etiquetas antes de responder.',
      'Escreva a resposta, use uma resposta rápida ou anexe um ficheiro.',
      'Atribua a conversa ao responsável e acompanhe a entrega.',
    ],
    tips: [
      'Evite criar um segundo contacto para o mesmo telefone.',
      'Personalize respostas rápidas antes de enviar.',
    ],
    related: ['contacts', 'support'],
  },
  {
    id: 'contacts',
    title: 'Construir o Cliente 360',
    category: 'Clientes',
    audience: 'staff',
    duration: '6 min',
    href: '/contacts',
    summary: 'Cadastre e consulte todo o relacionamento com cada cliente.',
    purpose:
      'O Cliente 360 combina identidade, conversas, marcações, financeiro, benefícios e histórico.',
    steps: [
      'Pesquise pelo nome, telefone ou email.',
      'Abra a ficha e reveja dados e consentimentos.',
      'Adicione etiquetas e campos personalizados.',
      'Consulte a linha do tempo antes de interagir.',
    ],
    tips: [
      'Mantenha telefone e email atualizados: eles controlam comunicações e acesso ao portal.',
    ],
    related: ['portal', 'agenda'],
  },
  {
    id: 'agenda',
    title: 'Criar e gerir marcações',
    category: 'Agenda',
    audience: 'staff',
    duration: '5 min',
    href: '/agenda',
    summary: 'Agende serviços, profissionais e acompanhe confirmações.',
    purpose:
      'A Agenda impede conflitos e organiza disponibilidade, serviços e acompanhamento.',
    steps: [
      'Escolha a data e clique num horário livre.',
      'Selecione cliente, serviço e profissional.',
      'Reveja duração, preço e observações.',
      'Salve e acompanhe confirmação, remarcação ou cancelamento.',
    ],
    tips: [
      'Configure primeiro os horários dos profissionais em Configurações.',
    ],
    related: ['portal-booking'],
  },
  {
    id: 'pipelines',
    title: 'Acompanhar oportunidades no Pipeline',
    category: 'Vendas',
    audience: 'staff',
    duration: '6 min',
    href: '/pipelines',
    summary: 'Transforme contactos em oportunidades acompanháveis.',
    purpose:
      'O pipeline mostra a etapa de cada oportunidade e qual deve ser a próxima ação.',
    steps: [
      'Crie um negócio associado ao cliente.',
      'Informe valor, responsável e previsão de fecho.',
      'Mova o cartão quando a oportunidade avançar.',
      'Registe o motivo ao ganhar ou perder.',
    ],
    tips: [
      'Use etapas que representem decisões reais do seu processo comercial.',
    ],
    related: ['contacts', 'reports'],
  },
  {
    id: 'automations',
    title: 'Automatizar tarefas repetitivas',
    category: 'Automação',
    audience: 'staff',
    duration: '8 min',
    href: '/automations',
    summary: 'Crie regras que trabalham quando um evento acontece.',
    purpose:
      'Automações reduzem trabalho manual e garantem respostas consistentes.',
    steps: [
      'Escolha o evento que inicia a automação.',
      'Adicione condições para limitar quem deve entrar.',
      'Defina as ações que serão executadas.',
      'Teste e só então ative.',
    ],
    tips: ['Comece pequeno e acompanhe os logs antes de expandir.'],
    related: ['broadcasts'],
  },
  {
    id: 'broadcasts',
    title: 'Enviar uma transmissão com segurança',
    category: 'Comunicação',
    audience: 'staff',
    duration: '7 min',
    href: '/broadcasts',
    summary: 'Segmente contactos e envie campanhas pelo WhatsApp.',
    purpose:
      'Transmissões permitem comunicação em escala com uma audiência definida.',
    steps: [
      'Escolha um modelo aprovado.',
      'Selecione a audiência por filtros e etiquetas.',
      'Reveja variáveis e pré-visualização.',
      'Agende ou envie e acompanhe o relatório.',
    ],
    tips: [
      'Envie apenas com consentimento e ofereça uma forma clara de saída.',
    ],
    related: ['contacts'],
  },
  {
    id: 'finance',
    title: 'Entender vendas, pagamentos e faturas',
    category: 'Financeiro',
    audience: 'staff',
    duration: '7 min',
    href: '/finance',
    summary: 'Controle valores vendidos, recebidos, pendentes e documentos.',
    purpose:
      'O Financeiro liga cada venda ao cliente, pagamentos e pedidos de fatura.',
    steps: [
      'Crie ou abra uma venda.',
      'Reveja itens, descontos, impostos e total.',
      'Registe o pagamento com o método correto.',
      'Processe os pedidos de fatura do portal.',
    ],
    tips: ['Nunca marque como pago antes de confirmar o recebimento.'],
    related: ['portal-finance', 'reports'],
  },
  {
    id: 'reports',
    title: 'Ler relatórios sem adivinhar',
    category: 'Gestão',
    audience: 'staff',
    duration: '5 min',
    href: '/reports',
    summary: 'Transforme dados operacionais em decisões.',
    purpose:
      'Relatórios mostram tendências de atendimento, vendas e desempenho ao longo do tempo.',
    steps: [
      'Escolha o período que quer analisar.',
      'Compare volume, conversão e tempo de resposta.',
      'Identifique variações relevantes.',
      'Abra a área de origem para investigar.',
    ],
    tips: [
      'Compare períodos equivalentes e evite decisões com amostras pequenas.',
    ],
    related: ['dashboard', 'pipelines'],
  },
  {
    id: 'portal',
    title: 'Ativar o Portal 360 para um cliente',
    category: 'Portal do cliente',
    audience: 'staff',
    duration: '5 min',
    href: '/settings',
    summary:
      'Ofereça uma área privada com agenda, benefícios, financeiro e suporte.',
    purpose:
      'O portal dá autonomia ao cliente sem expor o backoffice ou dados de outras pessoas.',
    steps: [
      'Ative e personalize o portal em Configurações.',
      'Garanta que o contacto possui um email exclusivo.',
      'Envie o acesso pela ficha do cliente.',
      'Oriente a definição da palavra-passe no primeiro acesso.',
    ],
    tips: ['A identidade do portal é isolada da identidade da equipa.'],
    related: ['portal-booking', 'support'],
  },
  {
    id: 'portal-home',
    title: 'Conheça o seu Portal 360',
    category: 'Primeiros passos',
    audience: 'client',
    duration: '3 min',
    summary: 'Encontre marcações, benefícios, pagamentos e dados pessoais.',
    purpose:
      'O Portal 360 reúne a sua relação com a empresa numa área privada e protegida.',
    steps: [
      'Use o menu para alternar entre as áreas.',
      'Na Visão geral, confira compromissos e saldos.',
      'Abra Perfil para manter os seus dados atualizados.',
    ],
    tips: [
      'Nunca partilhe a sua palavra-passe e termine a sessão num dispositivo público.',
    ],
    related: ['portal-booking', 'portal-finance', 'support'],
  },
  {
    id: 'portal-booking',
    title: 'Marcar ou acompanhar uma sessão',
    category: 'Marcações',
    audience: 'client',
    duration: '4 min',
    summary: 'Escolha serviço, profissional e horário disponíveis.',
    purpose:
      'A área permite consultar o histórico e, quando habilitado, agendar online.',
    steps: [
      'Abra As minhas marcações.',
      'Clique em Agendar sessão.',
      'Escolha serviço, profissional, data e horário.',
      'Confirme os dados antes de finalizar.',
    ],
    tips: [
      'Os horários mostrados já consideram a disponibilidade do profissional.',
    ],
    related: ['portal-home', 'support'],
  },
  {
    id: 'portal-finance',
    title: 'Consultar pagamentos e pedir fatura',
    category: 'Financeiro',
    audience: 'client',
    duration: '4 min',
    summary: 'Veja vendas, pagamentos e acompanhe documentos.',
    purpose:
      'A área financeira apresenta os seus movimentos e permite solicitar uma fatura.',
    steps: [
      'Abra Pagamentos e faturas.',
      'Selecione a venda desejada.',
      'Confira itens e pagamentos registados.',
      'Solicite a fatura e acompanhe o estado.',
    ],
    tips: ['Reveja nome fiscal, NIF e morada antes de enviar o pedido.'],
    related: ['portal-home', 'support'],
  },
  {
    id: 'support',
    title: 'Pedir ajuda e acompanhar um ticket',
    category: 'Suporte',
    audience: 'all',
    duration: '3 min',
    href: '/support',
    summary: 'Fale com a equipa sem perder o histórico do pedido.',
    purpose:
      'Tickets organizam dúvidas, problemas e solicitações até à resolução.',
    steps: [
      'Abra Ajuda e suporte.',
      'Escreva um assunto claro e descreva o que aconteceu.',
      'Acompanhe as respostas na mesma conversa.',
      'Responda quando solicitado e confirme a solução.',
    ],
    tips: [
      'Inclua o que tentou fazer e o resultado esperado; nunca envie palavras-passe.',
    ],
    related: ['portal-home'],
  },
  {
    id: 'public-website',
    title: 'Criar e publicar o site da empresa',
    category: 'Presença digital',
    audience: 'staff',
    duration: '9 min',
    href: '/website',
    summary:
      'Personalize identidade, empresa, serviços, planos e captação de contactos.',
    purpose:
      'O Site Público apresenta a empresa a qualquer visitante e transforma formulários em contactos e leads dentro do CRM.',
    steps: [
      'Abra Site Público e escolha um endereço exclusivo.',
      'Personalize cores, chamada principal e imagem de destaque.',
      'Conte a história e ative serviços e profissionais que deseja mostrar.',
      'Cadastre planos, benefícios, depoimentos e perguntas frequentes.',
      'Configure contactos, redes sociais e informações para pesquisa.',
      'Use Visualizar, reveja em telemóvel e computador e então publique.',
    ],
    tips: [
      'Use fotografias próprias, textos objetivos e dados de contacto atualizados.',
      'Os formulários recebidos aparecem em Leads e criam um contacto no CRM.',
    ],
    related: ['portal', 'contact-import', 'clinic-setup'],
  },
  {
    id: 'whatsapp-connect',
    title: 'Conectar e manter o WhatsApp online',
    category: 'WhatsApp',
    audience: 'staff',
    duration: '7 min',
    href: '/settings?tab=whatsapp',
    summary: 'Configure o canal, leia o QR Code e diagnostique desconexões.',
    purpose:
      'A ligação ao WhatsApp permite centralizar mensagens no CRM e precisa permanecer saudável para enviar e receber.',
    steps: [
      'Abra Configurações e aceda à área WhatsApp.',
      'Escolha o método de conexão disponível e siga as instruções.',
      'Leia o QR Code quando solicitado e aguarde o estado Conectado.',
      'Envie uma mensagem de teste e confirme o recebimento na Caixa de entrada.',
    ],
    tips: [
      'Não encerre sessões diretamente no telemóvel sem necessidade.',
      'Se desconectar, verifique internet e estado antes de recriar a sessão.',
    ],
    related: ['inbox', 'templates'],
  },
  {
    id: 'templates',
    title: 'Criar e gerir modelos de mensagem',
    category: 'WhatsApp',
    audience: 'staff',
    duration: '6 min',
    href: '/settings',
    summary: 'Prepare modelos para iniciar conversas e enviar campanhas.',
    purpose:
      'Modelos aprovados pela Meta permitem comunicações iniciadas pela empresa fora da janela de atendimento.',
    steps: [
      'Abra Configurações e localize Modelos.',
      'Defina nome, idioma, categoria e conteúdo.',
      'Configure corretamente todas as variáveis.',
      'Envie para aprovação e acompanhe o estado.',
    ],
    tips: [
      'Não prometa conteúdos diferentes do texto aprovado.',
      'Use exemplos realistas para facilitar a aprovação.',
    ],
    related: ['broadcasts', 'whatsapp-connect'],
  },
  {
    id: 'quick-replies',
    title: 'Configurar respostas rápidas',
    category: 'Atendimento',
    audience: 'staff',
    duration: '4 min',
    href: '/settings',
    summary:
      'Padronize respostas frequentes sem tornar o atendimento impessoal.',
    purpose:
      'Respostas rápidas poupam tempo e mantêm consistência nas informações prestadas pela equipa.',
    steps: [
      'Abra Configurações e aceda a Respostas rápidas.',
      'Crie um atalho fácil de recordar.',
      'Escreva uma resposta-base clara.',
      'Na Caixa de entrada, selecione o atalho e personalize antes de enviar.',
    ],
    tips: [
      'Reveja periodicamente preços, horários e políticas presentes nas respostas.',
    ],
    related: ['inbox'],
  },
  {
    id: 'tags-fields',
    title: 'Organizar clientes com etiquetas e campos',
    category: 'Clientes',
    audience: 'staff',
    duration: '6 min',
    href: '/settings',
    summary: 'Estruture informações para pesquisa, filtros e segmentação.',
    purpose:
      'Etiquetas representam classificações; campos personalizados guardam informações específicas e estruturadas.',
    steps: [
      'Defina quais informações realmente serão utilizadas.',
      'Crie etiquetas com nomes curtos e cores consistentes.',
      'Crie campos com o tipo correto: texto, número, data ou opção.',
      'Preencha a ficha do cliente e teste os filtros.',
    ],
    tips: ['Evite etiquetas duplicadas ou com significados ambíguos.'],
    related: ['contacts', 'broadcasts'],
  },
  {
    id: 'contact-import',
    title: 'Importar contactos com segurança',
    category: 'Clientes',
    audience: 'staff',
    duration: '7 min',
    href: '/contacts',
    summary: 'Prepare a planilha, valide dados e evite duplicações.',
    purpose:
      'A importação acelera a entrada de uma base existente sem sacrificar a qualidade dos dados.',
    steps: [
      'Faça uma cópia de segurança da origem.',
      'Padronize telefones com código do país e reveja emails.',
      'Associe corretamente as colunas durante a importação.',
      'Valide uma pequena amostra antes de importar toda a base.',
    ],
    tips: [
      'Consentimento de marketing não deve ser presumido durante a importação.',
    ],
    related: ['contacts', 'tags-fields'],
  },
  {
    id: 'notifications-guide',
    title: 'Usar a Central de Notificações',
    category: 'Operação',
    audience: 'staff',
    duration: '4 min',
    href: '/notifications',
    summary: 'Priorize alertas e encontre rapidamente o que exige ação.',
    purpose:
      'A Central de Notificações reúne eventos de atendimento, vendas, agenda, financeiro, automações e suporte.',
    steps: [
      'Abra o sino e identifique a prioridade pelo destaque.',
      'Use categorias e filtros para reduzir o ruído.',
      'Clique na ação para abrir o item de origem.',
      'Marque como resolvido quando a ação estiver concluída.',
    ],
    tips: [
      'Não use “marcar todas como lidas” como substituto para tratar alertas críticos.',
    ],
    related: ['support', 'dashboard'],
  },
  {
    id: 'anamnesis',
    title: 'Configurar e rever anamneses',
    category: 'Clínica',
    audience: 'staff',
    duration: '7 min',
    href: '/agenda',
    summary:
      'Recolha informações prévias e mantenha o histórico ligado ao cliente.',
    purpose:
      'A anamnese estrutura dados fornecidos pelo cliente antes do atendimento e apoia uma revisão responsável.',
    steps: [
      'Configure as modalidades e perguntas necessárias.',
      'Associe a anamnese ao serviço ou marcação.',
      'Envie ou disponibilize o formulário ao cliente.',
      'Reveja respostas e assinatura antes de marcar como revista.',
    ],
    tips: [
      'Recolha apenas dados necessários e aplique as regras de privacidade adequadas.',
    ],
    related: ['agenda', 'portal-anamnesis'],
  },
  {
    id: 'clinic-setup',
    title: 'Configurar serviços e profissionais',
    category: 'Clínica',
    audience: 'staff',
    duration: '8 min',
    href: '/settings',
    summary: 'Defina catálogo, duração, preço, horários e disponibilidade.',
    purpose:
      'Uma configuração clínica coerente é a base para agendas corretas e marcações online sem conflitos.',
    steps: [
      'Cadastre serviços com duração e preço.',
      'Ative profissionais e associe os serviços atendidos.',
      'Defina horários de trabalho, pausas e exceções.',
      'Teste a disponibilidade numa data futura.',
    ],
    tips: [
      'Inclua tempo de preparação quando ele bloquear a agenda do profissional.',
    ],
    related: ['agenda', 'portal-booking'],
  },
  {
    id: 'benefits-admin',
    title: 'Gerir vouchers, carteira e pacotes',
    category: 'Financeiro',
    audience: 'staff',
    duration: '8 min',
    href: '/finance',
    summary: 'Emita benefícios e acompanhe utilização, saldo e validade.',
    purpose:
      'Benefícios permitem créditos, descontos e sessões pré-pagas com rastreabilidade por cliente.',
    steps: [
      'Escolha entre voucher, crédito de carteira ou pacote.',
      'Defina valor, sessões, serviço e validade.',
      'Associe ao cliente e confirme a emissão.',
      'Acompanhe reservas, utilizações, reversões e saldo.',
    ],
    tips: ['Nunca altere manualmente um saldo sem registar o motivo.'],
    related: ['finance', 'portal-benefits'],
  },
  {
    id: 'referrals-admin',
    title: 'Configurar o programa de indicações',
    category: 'Crescimento',
    audience: 'staff',
    duration: '7 min',
    href: '/referrals',
    summary: 'Defina regras, recompensas e acompanhe indicações.',
    purpose:
      'O programa transforma clientes satisfeitos em promotores com regras de qualificação verificáveis.',
    steps: [
      'Ative o programa e defina os critérios.',
      'Configure a recompensa do indicador e do indicado.',
      'Divulgue o código ou link individual.',
      'Acompanhe estados, qualificação, emissão e resgate.',
    ],
    tips: ['Explique claramente quando uma indicação se torna elegível.'],
    related: ['portal-referrals', 'benefits-admin'],
  },
  {
    id: 'flows',
    title: 'Construir fluxos visuais',
    category: 'Automação',
    audience: 'staff',
    duration: '10 min',
    href: '/flows',
    summary: 'Ligue gatilhos, mensagens, decisões e encaminhamentos.',
    purpose:
      'Fluxos representam jornadas com múltiplos passos e caminhos, permitindo automações mais sofisticadas.',
    steps: [
      'Defina objetivo e ponto de entrada do fluxo.',
      'Adicione nós de mensagem, condição e ação.',
      'Ligue todos os caminhos, incluindo falhas e saída humana.',
      'Valide, teste com um contacto interno e só depois ative.',
    ],
    tips: ['Todo fluxo deve ter uma saída clara para atendimento humano.'],
    related: ['automations', 'ai-agents'],
  },
  {
    id: 'ai-agents',
    title: 'Configurar Agentes de IA',
    category: 'Inteligência Artificial',
    audience: 'staff',
    duration: '9 min',
    href: '/agents',
    summary:
      'Defina comportamento, conhecimento, limites e transferência humana.',
    purpose:
      'O agente de IA pode responder perguntas recorrentes usando instruções e uma base de conhecimento controlada.',
    steps: [
      'Defina o papel, tom de voz e assuntos permitidos.',
      'Adicione fontes confiáveis à base de conhecimento.',
      'Configure limites de respostas e transferência.',
      'Teste perguntas normais, ambíguas e sensíveis no playground.',
    ],
    tips: [
      'A IA não deve inventar preços, políticas ou recomendações sensíveis.',
      'Mantenha sempre um caminho de transferência para uma pessoa.',
    ],
    related: ['flows', 'inbox'],
  },
  {
    id: 'members-roles',
    title: 'Convidar membros e definir permissões',
    category: 'Administração',
    audience: 'staff',
    duration: '6 min',
    href: '/settings',
    summary: 'Dê a cada pessoa apenas o acesso necessário.',
    purpose:
      'Funções e permissões protegem dados e separam responsabilidades entre proprietários, administradores, agentes e visualizadores.',
    steps: [
      'Abra Configurações e aceda a Membros.',
      'Convide pelo email profissional correto.',
      'Escolha a função de acordo com as responsabilidades.',
      'Reveja acessos sempre que alguém mudar de função ou sair.',
    ],
    tips: ['Evite partilhar contas. Cada pessoa deve usar o próprio acesso.'],
    related: ['security', 'work-time'],
  },
  {
    id: 'security',
    title: 'Proteger conta, sessões e dados',
    category: 'Administração',
    audience: 'staff',
    duration: '6 min',
    href: '/settings',
    summary: 'Aplique práticas essenciais de acesso e recuperação.',
    purpose:
      'Segurança depende de credenciais individuais, sessões controladas e permissões mínimas.',
    steps: [
      'Use uma palavra-passe exclusiva e forte.',
      'Reveja sessões ativas e encerre as desconhecidas.',
      'Mantenha o email de recuperação atualizado.',
      'Remova imediatamente acessos que já não sejam necessários.',
    ],
    tips: [
      'Nunca solicite ou envie palavras-passe por tickets, WhatsApp ou email.',
    ],
    related: ['members-roles', 'api-webhooks'],
  },
  {
    id: 'work-time',
    title: 'Registar jornada, pausas e ausências',
    category: 'Equipa',
    audience: 'staff',
    duration: '5 min',
    href: '/settings',
    summary: 'Acompanhe horários de trabalho e justificações.',
    purpose:
      'O controlo de jornada organiza entradas, saídas, pausas, faltas e respetivas justificações.',
    steps: [
      'Inicie a jornada ao começar o trabalho.',
      'Registe pausas no momento correto.',
      'Finalize a jornada ao terminar.',
      'Quando necessário, envie uma justificação com informação suficiente.',
    ],
    tips: ['Não corrija horários informalmente; mantenha o registo auditável.'],
    related: ['members-roles', 'notifications-guide'],
  },
  {
    id: 'api-webhooks',
    title: 'Usar API, chaves e webhooks',
    category: 'Integrações',
    audience: 'staff',
    duration: '9 min',
    href: '/settings',
    summary: 'Integre sistemas externos com credenciais e eventos controlados.',
    purpose:
      'A API permite consultar ou alterar dados; webhooks informam sistemas externos quando eventos acontecem.',
    steps: [
      'Crie uma chave com o menor conjunto de permissões possível.',
      'Guarde o segredo num cofre de credenciais.',
      'Configure o endpoint e o segredo de verificação do webhook.',
      'Teste respostas, autenticação, repetição e tratamento de falhas.',
    ],
    tips: [
      'Nunca coloque chaves em código público ou no navegador.',
      'Revogue imediatamente uma chave exposta.',
    ],
    related: ['security'],
  },
  {
    id: 'troubleshoot-messages',
    title: 'Mensagem não enviada ou recebida',
    category: 'Solução de problemas',
    audience: 'staff',
    duration: '5 min',
    href: '/inbox',
    summary: 'Diagnostique conexão, destinatário, janela e conteúdo.',
    purpose:
      'Falhas de mensagem normalmente envolvem estado do canal, formato do telefone, regras da Meta ou conteúdo inválido.',
    steps: [
      'Confirme se o WhatsApp está conectado.',
      'Valide o telefone com código do país.',
      'Verifique o estado e o erro exibido na mensagem.',
      'Fora da janela permitida, utilize um modelo aprovado.',
    ],
    tips: [
      'Registe horário, contacto e mensagem do erro antes de abrir um ticket.',
    ],
    related: ['whatsapp-connect', 'templates', 'support'],
  },
  {
    id: 'troubleshoot-portal',
    title: 'Cliente não consegue entrar no portal',
    category: 'Solução de problemas',
    audience: 'staff',
    duration: '5 min',
    href: '/settings',
    summary: 'Verifique portal ativo, email, convite e identidade isolada.',
    purpose:
      'O acesso ao portal depende de uma configuração ativa e de um email válido e exclusivo na ficha do cliente.',
    steps: [
      'Confirme se o Portal 360 está ativo.',
      'Verifique o email na ficha do contacto.',
      'Reenvie o acesso ou inicie a recuperação de palavra-passe.',
      'Teste numa janela privada e confirme o endereço do portal.',
    ],
    tips: [
      'O acesso do cliente ao portal não é o mesmo acesso de um membro da equipa.',
    ],
    related: ['portal', 'security'],
  },
  {
    id: 'portal-access',
    title: 'Primeiro acesso e palavra-passe',
    category: 'Acesso e segurança',
    audience: 'client',
    duration: '4 min',
    summary: 'Entre com segurança e defina a sua palavra-passe exclusiva.',
    purpose:
      'O primeiro acesso confirma a sua identidade e cria uma credencial própria para o Portal 360.',
    steps: [
      'Abra o link enviado pela empresa.',
      'Confirme o seu email quando solicitado.',
      'Crie uma palavra-passe forte e exclusiva.',
      'Entre novamente e guarde o endereço correto do portal.',
    ],
    tips: [
      'O acesso ao portal é pessoal; não partilhe o link nem a palavra-passe.',
    ],
    related: ['portal-home', 'portal-profile'],
  },
  {
    id: 'portal-password',
    title: 'Alterar ou recuperar a palavra-passe',
    category: 'Acesso e segurança',
    audience: 'client',
    duration: '3 min',
    summary: 'Recupere o acesso sem partilhar credenciais.',
    purpose:
      'A recuperação permite criar uma nova palavra-passe por meio do email associado à sua ficha.',
    steps: [
      'Na entrada do portal, escolha a opção de recuperação.',
      'Informe o mesmo email registado na empresa.',
      'Abra a mensagem recebida e siga o link dentro do prazo.',
      'Crie uma nova palavra-passe e entre novamente.',
    ],
    tips: [
      'Se não receber o email, verifique spam e confirme o endereço com a empresa.',
    ],
    related: ['portal-access', 'support'],
  },
  {
    id: 'portal-anamnesis',
    title: 'Preencher e assinar uma anamnese',
    category: 'Saúde e formulários',
    audience: 'client',
    duration: '6 min',
    summary: 'Responda ao formulário com atenção antes da sessão.',
    purpose:
      'A anamnese reúne informações importantes para preparar o atendimento de forma responsável.',
    steps: [
      'Abra Fichas de anamnese.',
      'Selecione o formulário pendente.',
      'Responda todas as perguntas obrigatórias com informações verdadeiras.',
      'Reveja, assine e envie.',
    ],
    tips: [
      'Se uma resposta mudar antes da sessão, informe diretamente a empresa.',
    ],
    related: ['portal-booking', 'support'],
  },
  {
    id: 'portal-benefits',
    title: 'Consultar benefícios, carteira e pacotes',
    category: 'Benefícios',
    audience: 'client',
    duration: '5 min',
    summary: 'Veja saldo, validade, sessões e histórico de utilização.',
    purpose:
      'A área de benefícios mostra os recursos disponíveis e como foram utilizados.',
    steps: [
      'Abra Benefícios e saldo.',
      'Confira créditos, vouchers e pacotes ativos.',
      'Verifique validade e serviços associados.',
      'Consulte o histórico para entender cada movimento.',
    ],
    tips: [
      'Confirme as condições antes de utilizar um benefício numa marcação.',
    ],
    related: ['portal-booking', 'portal-finance'],
  },
  {
    id: 'portal-referrals',
    title: 'Indicar um amigo e acompanhar recompensa',
    category: 'Indicações',
    audience: 'client',
    duration: '4 min',
    summary: 'Partilhe o seu código e acompanhe o progresso da indicação.',
    purpose:
      'Quando o programa está ativo, pode indicar pessoas e receber uma recompensa conforme as regras.',
    steps: [
      'Abra Indique um amigo.',
      'Copie o seu código ou link pessoal.',
      'Partilhe com a pessoa indicada.',
      'Acompanhe o estado e a recompensa no portal.',
    ],
    tips: [
      'A recompensa só é emitida quando os critérios apresentados forem cumpridos.',
    ],
    related: ['portal-benefits', 'support'],
  },
  {
    id: 'portal-profile',
    title: 'Atualizar perfil, dados fiscais e consentimentos',
    category: 'Perfil e privacidade',
    audience: 'client',
    duration: '5 min',
    summary:
      'Mantenha os seus dados corretos e escolha como deseja ser contactado.',
    purpose:
      'Dados atualizados evitam falhas de comunicação, documentos incorretos e problemas de acesso.',
    steps: [
      'Abra Perfil e privacidade.',
      'Reveja contacto, morada e dados fiscais.',
      'Atualize preferências e consentimentos disponíveis.',
      'Guarde e confirme a alteração.',
    ],
    tips: ['Use um email ao qual apenas você tenha acesso.'],
    related: ['portal-access', 'portal-finance'],
  },
  {
    id: 'portal-notifications',
    title: 'Entender e gerir notificações',
    category: 'Notificações',
    audience: 'client',
    duration: '3 min',
    summary: 'Acompanhe respostas, marcações e documentos importantes.',
    purpose:
      'O sino reúne atualizações do suporte, da agenda e de pedidos de fatura.',
    steps: [
      'Abra o sino e veja os itens ainda não lidos.',
      'Clique numa notificação para abrir a área relacionada.',
      'Tome a ação necessária.',
      'Marque todas como lidas apenas depois de rever os avisos.',
    ],
    tips: [
      'O contador é atualizado automaticamente enquanto o portal está aberto.',
    ],
    related: ['support', 'portal-booking', 'portal-finance'],
  },
  {
    id: 'portal-troubleshoot',
    title: 'Algo não aparece no meu portal',
    category: 'Solução de problemas',
    audience: 'client',
    duration: '3 min',
    summary: 'Faça verificações simples antes de pedir ajuda.',
    purpose:
      'Algumas áreas dependem das funcionalidades ativadas pela empresa e dos dados associados à sua ficha.',
    steps: [
      'Atualize a página e confirme a ligação à internet.',
      'Verifique se entrou com o email correto.',
      'Consulte as notificações para possíveis alterações.',
      'Se continuar, abra um pedido e diga qual área e informação estão ausentes.',
    ],
    tips: [
      'Uma captura de tela ajuda, mas oculte dados sensíveis antes de enviar.',
    ],
    related: ['support', 'portal-notifications'],
  },
];
