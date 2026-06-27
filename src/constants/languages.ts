export const LANGUAGE_DEFINITIONS = [
  { id: 'html', extensions: ['html'] },
  { id: 'javascriptreact', extensions: ['jsx'] },
  { id: 'typescriptreact', extensions: ['tsx'] },
  { id: 'vue', extensions: ['vue'] },
  { id: 'svelte', extensions: ['svelte'] },
  { id: 'typescript', extensions: ['ts'] },
  { id: 'javascript', extensions: ['js'] },
  { id: 'razor', extensions: ['razor'] },
  { id: 'php', extensions: ['php'] },
  { id: 'twig', extensions: ['twig'] },
];

export const SUPPORTED_LANGUAGES = LANGUAGE_DEFINITIONS.map((lang) => lang.id);

export const SUPPORTED_EXTENSIONS = LANGUAGE_DEFINITIONS.flatMap(
  (lang) => lang.extensions,
);

export const SUPPORTED_FILES_GLOB = `**/*.{${SUPPORTED_EXTENSIONS.join(',')}}`;

export const getLanguageIdFromExtension = (ext?: string): string => {
  if (!ext) return 'html';
  const lowerExt = ext.toLowerCase();

  const language = LANGUAGE_DEFINITIONS.find((lang) =>
    lang.extensions.includes(lowerExt),
  );

  return language ? language.id : 'html';
};

export const getLanguageIdFromFileName = (fileName: string): string => {
  const ext = fileName.split('.').pop();
  return getLanguageIdFromExtension(ext);
};
