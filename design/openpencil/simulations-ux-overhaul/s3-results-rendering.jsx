<Frame name="S3 · AI Results – Simulation rendering (progress n of N, per-photo tiles)" y={1100} flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – 'Back to my kitchen'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed)" flex="row" h={44} gap={6} items="center" py={0} px={14} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={18} color="#182231" />
        <Text name="Current language" color="#182231" weight={600} lineHeight={20}>English</Text>
        <Icon name="lucide:chevron-down" size={16} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (signed in)" flex="row" w={44} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Initial" color="#FFFFFF" size={16} weight={600} lineHeight={24}>M</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Designing your kitchen</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>One calculated style from 2 gallery styles and 3 of your photos, applied to each of your 6 kitchen photos.</Text>
    </Frame>
    <Frame name="StatusCard (aria-busy; role=status aria-live=polite)" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Frame name="Row" flex="row" w="fill" justify="between" items="center">
        <Frame name="Label" flex="row" gap={8} items="center">
          <Icon name="lucide:loader" size={24} color="#2968EC" />
          <Text name="Status" color="#182231" size={16} weight={600} lineHeight={24}>Rendering 3 of 6</Text>
        </Frame>
        <Text name="Percent" color="#6B6B70" weight={600} lineHeight={20}>50%</Text>
      </Frame>
      <Frame name="Progress track (determinate)" w="fill" h={6} bg="#E2E0DA" rounded={999}>
        <Frame name="Progress fill (n of N)" w={163} h={6} bg="#2968EC" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Photo tiles (wrap, flexible columns, 4:3, radius 12)" flex="row" w="fill" gap={12} wrap rowGap={12}>
      <Frame name="Tile 1 done" flex="row" w={110} h={82} justify="end" p={4} bg="#D9D6CE" rounded={12}>
        <Frame name="Done badge" flex="row" w={24} h={24} justify="center" items="center" bg="#2968EC" rounded={999}>
          <Icon name="lucide:check" size={14} color="#FFFFFF" />
        </Frame>
      </Frame>
      <Frame name="Tile 2 done" flex="row" w={110} h={82} justify="end" p={4} bg="#CFCBC1" rounded={12}>
        <Frame name="Done badge" flex="row" w={24} h={24} justify="center" items="center" bg="#2968EC" rounded={999}>
          <Icon name="lucide:check" size={14} color="#FFFFFF" />
        </Frame>
      </Frame>
      <Frame name="Tile 3 running" flex="row" w={110} h={82} justify="center" items="center" bg="#D9D6CE" stroke="#2968EC" strokeWidth={3} rounded={12}>
        <Icon name="lucide:loader" size={24} color="#2968EC" />
      </Frame>
      <Frame name="Tile 4 queued" flex="row" w={110} h={82} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
        <Icon name="lucide:hourglass" size={20} color="#6B6B70" />
      </Frame>
      <Frame name="Tile 5 queued" flex="row" w={110} h={82} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
        <Icon name="lucide:hourglass" size={20} color="#6B6B70" />
      </Frame>
      <Frame name="Tile 6 queued" flex="row" w={110} h={82} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
        <Icon name="lucide:hourglass" size={20} color="#6B6B70" />
      </Frame>
    </Frame>
    <Text name="Note" w="fill" color="#6B6B70" lineHeight={20}>You can leave this page; the simulation keeps going and appears here when it's ready.</Text>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Text name="Hint" w="fill" color="#6B6B70" lineHeight={20}>One simulation at a time.</Text>
    <Frame name="PrimaryCTA disabled 'Generate again' (aria-disabled)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Generate again</Text>
    </Frame>
  </Frame>
</Frame>