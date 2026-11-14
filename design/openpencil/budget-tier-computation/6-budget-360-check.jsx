<Frame name="6 · 360x780 check – German long labels, compact selector (Nederlands-style pill)" x={2250} flex="col" w={360} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector compact (<375px)" flex="row" h={44} gap={4} items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={16} color="#182231" />
        <Text name="Current language" color="#182231" size={12} weight={600} lineHeight={16}>Deutsch</Text>
        <Icon name="lucide:chevron-down" size={14} color="#182231" />
      </Frame>
      <Frame name="AccountEntry" flex="row" w={44} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Initial" color="#FFFFFF" size={16} weight={600} lineHeight={24}>M</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Ihr Küchenbudget</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Vier Optionen, von Premium bis Basis. Tippen Sie auf eine Option, um jeden Artikel zu sehen.</Text>
    </Frame>
    <Frame name="TierCard Luxury de" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
      <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
        <Frame name="Tier label" flex="row" gap={8} items="center">
          <Icon name="lucide:gem" size={20} color="#2968EC" />
          <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Luxus</Text>
        </Frame>
        <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
          <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
        </Frame>
      </Frame>
      <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>18.450,00 €</Text>
      <Text name="Meta" w="fill" color="#6B6B70" lineHeight={20}>14 Artikel · inkl. MwSt.</Text>
    </Frame>
    <Frame name="Totals block de" flex="col" w="fill" gap={8}>
      <Frame name="Row Subtotal" flex="row" w="fill" gap={12} justify="between">
        <Text name="Label" grow={1} color="#6B6B70" lineHeight={20}>Zwischensumme (ohne MwSt.)</Text>
        <Text name="Value" color="#182231" weight={600} lineHeight={20}>15.248,76 €</Text>
      </Frame>
      <Frame name="Row Total" flex="row" w="fill" gap={12} justify="between">
        <Text name="Label" grow={1} color="#182231" size={16} weight={600} lineHeight={24}>Gesamtsumme (inkl. MwSt.)</Text>
        <Text name="Value" color="#182231" size={16} weight="bold" lineHeight={24}>18.450,00 €</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>