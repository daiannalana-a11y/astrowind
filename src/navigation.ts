import { getHomePermalink, getBlogPermalink, getAsset, getPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Home',
      href: getHomePermalink(),
    },
    {
      text: 'Quem Somos',
      href: getPermalink('/about'),
    },
    {
      text: 'Serviços',
      links: [
        { text: 'Engenharia Ambiental', href: getPermalink('/services#ambiental') },
        { text: 'Engenharia de Produção', href: getPermalink('/services#producao') },
        { text: 'Segurança do Trabalho', href: getPermalink('/services#seguranca') },
      ],
    },
    {
      text: 'Blog',
      href: getBlogPermalink(),
    },
    {
      text: 'Fale Conosco',
      href: getPermalink('/contact'),
    },
  ],
  actions: [{ text: 'Login', type: 'button', href: getPermalink('/login') }],
};
