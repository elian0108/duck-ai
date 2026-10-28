/**
 * Model definitions and aliases for Duck.ai & DeepSeek Harness
 */

const BASE_DUCK_MODELS = [
  {
    id: 'mistral-small-2603',
    name: 'Mistral Small 4',
    uiName: 'Mistral Small 4',
    uiRolePattern: 'Mistral Small 4',
    provider: 'Mistral AI',
    description: 'Modelo de alta precisão para chamadas de ferramentas e desenvolvimento de software.',
    created: 1792000000,
    contextWindow: 16000,
    isDefault: true,
    badge: 'Recomendado / Tools',
    aliases: [
      'mistral-small-2603', 'mistral-small-4', 'mistral', 'mistral-small', 'default',
      'claude-3-5-sonnet', 'claude-3-5-sonnet-latest', 'claude-3-5-sonnet-20241022',
      'claude-3-7-sonnet', 'claude-3-7-sonnet-latest', 'claude-3-7-sonnet-20250219',
      'claude-3-opus', 'claude-3-opus-20240229', 'claude-opus-3-5', 'claude-opus-4-0',
      'claude-3-5-opus', 'claude-opus', 'opus-3-5', 'sonnet', 'opus'
    ]
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    uiName: 'GPT-6 Luna',
    uiRolePattern: '6 Luna',
    provider: 'OpenAI',
    description: 'Ideal para o dia a dia. Raciocínio ágil, alta precisão e versatilidade.',
    created: 1792000000,
    contextWindow: 16000,
    isDefault: false,
    badge: 'OpenAI',
    aliases: [
      'gpt-6', 'gpt-6-luna', 'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'openai'
    ]
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 mini',
    uiName: 'GPT-5.4 mini',
    uiRolePattern: 'GPT-5.4 mini',
    provider: 'OpenAI',
    description: 'Sólido e veloz, otimizado para tarefas curtas e respostas rápidas.',
    created: 1792000000,
    contextWindow: 16000,
    badge: 'Rápido',
    aliases: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5.4', 'gpt-5']
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    uiName: 'Claude Haiku 4.5',
    uiRolePattern: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Excelente para síntese, redação fluida e geração de código limpo.',
    created: 1792000000,
    contextWindow: 16000,
    aliases: [
      'claude-haiku-4-5',
      'claude-3-5-haiku',
      'claude-3-5-haiku-latest',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307',
      'claude-haiku',
      'claude-3-haiku',
      'claude',
      'router',
      'haiku'
    ]
  },
  {
    id: 'tinfoil/gpt-oss-120b',
    name: 'gpt-oss 120B',
    uiName: 'gpt-oss 120B',
    uiRolePattern: 'gpt-oss 120B',
    provider: 'OpenAI / Tinfoil',
    description: '120B parâmetros open-source com execução em enclaves privados criptografados.',
    created: 1792000000,
    contextWindow: 16000,
    badge: 'Open 120B',
    aliases: ['tinfoil/gpt-oss-120b', 'gpt-oss-120b', 'gpt-oss', 'openai/gpt-oss-120b', 'oss-120b']
  },
  {
    id: 'tinfoil/gemma4-31b',
    name: 'Gemma 4 31B Beta',
    uiName: 'Gemma 4 31BBeta',
    uiRolePattern: 'Gemma 4 31B',
    provider: 'Google / Tinfoil',
    description: 'Modelo aberto de última geração do Google com 31 bilhões de parâmetros.',
    created: 1792000000,
    contextWindow: 16000,
    badge: 'Google Beta',
    aliases: ['tinfoil/gemma4-31b', 'gemma4-31b', 'gemma-4', 'gemma', 'gemma-31b', 'gemma4']
  }
];

const MODELS = BASE_DUCK_MODELS;

/**
 * Resolve input model ID or alias to canonical Duck.ai model object
 */
function resolveModel(inputModel) {
  if (!inputModel) {
    return BASE_DUCK_MODELS.find(m => m.isDefault) || BASE_DUCK_MODELS[0];
  }
  const clean = inputModel.trim().toLowerCase();

  // Exact ID match in official Duck.ai models
  let found = BASE_DUCK_MODELS.find(m => m.id.toLowerCase() === clean);
  if (found) return found;

  // Name match
  found = BASE_DUCK_MODELS.find(m => m.name.toLowerCase() === clean);
  if (found) return found;

  // Alias match
  found = BASE_DUCK_MODELS.find(m => m.aliases && m.aliases.some(a => a.toLowerCase() === clean));
  if (found) return found;

  // Graceful fallback for legacy harness model names without exposing them in listings
  if (clean.includes('deepseek') || clean.includes('dsh')) {
    const mistral = BASE_DUCK_MODELS.find(m => m.id === 'mistral-small-2603');
    return mistral || BASE_DUCK_MODELS[0];
  }

  // Partial match
  found = BASE_DUCK_MODELS.find(m => m.id.toLowerCase().includes(clean) || clean.includes(m.id.toLowerCase()));
  if (found) return found;

  // Fallback default
  return BASE_DUCK_MODELS.find(m => m.isDefault) || BASE_DUCK_MODELS[0];
}

module.exports = {
  MODELS,
  BASE_DUCK_MODELS,
  resolveModel
};
