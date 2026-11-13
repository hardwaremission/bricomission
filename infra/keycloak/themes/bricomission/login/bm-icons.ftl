<#--
  Inline Lucide icons (lucide-react 1.72.0, ISC License, Copyright (c) Lucide Contributors).
  Inline SVG only: no icon font, no runtime fetch. Decorative (aria-hidden); text carries the meaning.
-->
<#macro icon name size=20 extraClass="">
<svg class="bm-icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><#switch name><#case "eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/><#break><#case "eye-off"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/><#break><#case "circle-alert"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/><#break><#case "clock"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><#break><#case "info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/><#break><#case "mail"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/><#break><#case "arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/><#break></#switch></svg>
</#macro>
