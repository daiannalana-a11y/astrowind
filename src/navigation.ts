import { getPermalink, getBlogPermalink } from './utils/permalinks';

export const headerData = {
links: [
    {
      text: 'Quem Somos',
      href: getPermalink('/about'),
    },
    {
      text: 'Serviços',
      links: [
        { text: '🌿 Engenharia Ambiental', href: getPermalink('/services#ambiental') },
        { text: '⚙️ Engenharia de Produção', href: getPermalink('/services#producao') },
        { text: '🦺 Segurança do Trabalho', href: getPermalink('/services#seguranca') },
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
  actions: [
    {
      text: 'Fale Conosco',
      href: getPermalink('/contact'),
      variant: 'primary',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: 'Serviços',
      links: [
        { text: 'Engenharia Ambiental', href: '/services#ambiental' },
        { text: 'Engenharia de Produção', href: '/services#producao' },
        { text: 'Segurança do Trabalho', href: '/services#seguranca' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { text: 'Quem Somos', href: '/about' },
        { text: 'Blog', href: '/blog' },
        { text: 'Fale Conosco', href: '/contact' },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Política de Privacidade', href: getPermalink('/privacy') },
    { text: 'Termos de Uso', href: getPermalink('/terms') },
  ],
  socialLinks: [
    { ariaLabel: 'LinkedIn', icon: 'tabler:brand-linkedin', href: '#' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: '#' },
    { ariaLabel: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: '#' },
  ],
  footNote: `© ${new Date().getFullYear()} <strong>Triaxis</strong> Consultoria · Todos os direitos reservados.`,
};
