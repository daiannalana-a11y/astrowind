import { getPermalink, getBlogPermalink } from './utils/permalinks';

export const headerData = {
links: [
    {
      text: 'Início',
      href: getPermalink('/'),
    },
    {
      text: 'Quem Somos',
      href: getPermalink('/about'),
    },
    {
      text: 'Serviços',
      href: getPermalink('/services'),
      links: [
        { text: '🌿 Engenharia Ambiental', href: getPermalink('/servicos/ambiental') },
        { text: '⚙️ Engenharia de Produção', href: getPermalink('/servicos/producao') },
        { text: '🦺 Segurança do Trabalho', href: getPermalink('/servicos/seguranca') },
      ],
    },
    {
      text: 'Blog',
      href: getBlogPermalink(),
    },
  ],
  actions: [
    {
      text: 'WhatsApp',
      href: 'https://wa.me/5531994915126',
      variant: 'primary',
      icon: 'tabler:brand-whatsapp',
      class: 'btn-whatsapp',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: 'Serviços',
      links: [
        { text: 'Todos os Serviços', href: '/services' },
        { text: 'Engenharia Ambiental', href: '/servicos/ambiental' },
        { text: 'Engenharia de Produção', href: '/servicos/producao' },
        { text: 'Segurança do Trabalho', href: '/servicos/seguranca' },
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
    { ariaLabel: 'LinkedIn', icon: 'tabler:brand-linkedin', href: 'https://www.linkedin.com/company/triaxis-engenharia/' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/triaxisdesenvolvimento/' },
    { ariaLabel: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: 'https://wa.me/5531994915126' },
  ],
  footNote: `© ${new Date().getFullYear()} <strong>Triaxis</strong> Consultoria · Todos os direitos reservados.`,
};
