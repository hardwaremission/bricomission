<Frame name="S7 · Kitchen Project – My simulations (owned page /kitchen-projects/[id]; Simulation 2 selected)" y={1200} flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Logo link 140x44" flex="row" w={140} h={44} items="center">
      <Text name="Wordmark placeholder" color="#182231" size={18} weight="bold" lineHeight={24}>BricoMission</Text>
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
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your kitchen project</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Edit your photos, measurements and styles at any time. Pick one simulation to get your budget.</Text>
    </Frame>
    <Frame name="Summary card (existing) with three edit entries" flex="col" w="fill" gap={4} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
      <Frame name="Row Photos – 'Edit photos' (44 high, goes to the Capture screen with project context)" flex="row" h={44} w="fill" justify="between" items="center">
        <Text name="Label" color="#182231" size={16} weight={600} lineHeight={24}>6 photos</Text>
        <Text name="Edit link" color="#2968EC" weight={600} lineHeight={20}>Edit photos</Text>
      </Frame>
      <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
      <Frame name="Row Measurements" flex="row" h={44} w="fill" justify="between" items="center">
        <Text name="Label" color="#182231" size={16} weight={600} lineHeight={24}>420 x 310 x 250 cm</Text>
        <Text name="Edit link" color="#2968EC" weight={600} lineHeight={20}>Edit measurements</Text>
      </Frame>
      <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
      <Frame name="Row Styles" flex="row" h={44} w="fill" justify="between" items="center">
        <Text name="Label" color="#182231" size={16} weight={600} lineHeight={24}>4 styles and references</Text>
        <Text name="Edit link" color="#2968EC" weight={600} lineHeight={20}>Edit styles</Text>
      </Frame>
    </Frame>
    <Frame name="Section My simulations" flex="col" w="fill" gap={12}>
      <Frame name="Header" flex="row" w="fill" justify="between" items="center">
        <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>My simulations</Text>
        <Text name="Counter" color="#6B6B70" weight={600} lineHeight={20}>3</Text>
      </Frame>
      <Frame name="Instruction (info alert): how to get a budget" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={16}>
        <Icon name="lucide:info" size={20} color="#2968EC" />
        <Text name="Message" grow={1} color="#182231" lineHeight={20}>To get your budget, select one simulation below. The budget counts every element visible in its images.</Text>
      </Frame>
      <Frame name="SimulationCard 3 – ready, not selected" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Text" flex="col" gap={2}>
            <Text name="Name" color="#182231" size={16} weight={600} lineHeight={24}>Simulation 3</Text>
            <Text name="Meta" color="#6B6B70" lineHeight={20}>14 Nov, 17:19 · 6 photos</Text>
          </Frame>
          <Frame name="Delete (44 hit area, opens a confirm dialog)" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:trash-2" size={20} color="#C0392B" />
          </Frame>
        </Frame>
        <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
          <Frame name="t1" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t2" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t3" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t+n" flex="row" w={64} h={48} justify="center" items="center" bg="#F2F1ED" rounded={8}>
            <Text name="More" color="#6B6B70" weight={600} lineHeight={20}>+3</Text>
          </Frame>
        </Frame>
        <Frame name="Actions" flex="row" w="fill" gap={8}>
          <Frame name="Open (secondary pill h 44)" flex="row" h={44} grow={1} gap={6} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
            <Icon name="lucide:maximize-2" size={16} color="#2968EC" />
            <Text name="Label" color="#2968EC" weight={600} lineHeight={20}>Open</Text>
          </Frame>
          <Frame name="Select (radio, aria-checked=false)" flex="row" h={44} grow={1} gap={6} justify="center" items="center" bg="#F2F1ED" rounded={999}>
            <Icon name="lucide:circle" size={16} color="#182231" />
            <Text name="Label" color="#182231" weight={600} lineHeight={20}>Select</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame name="SimulationCard 2 – SELECTED (3 px primary stroke + Selected badge + aria-checked)" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" strokeWidth={3} rounded={20}>
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Text" flex="col" gap={2}>
            <Text name="Name" color="#182231" size={16} weight={600} lineHeight={24}>Simulation 2</Text>
            <Text name="Meta" color="#6B6B70" lineHeight={20}>14 Nov, 17:15 · 6 photos</Text>
          </Frame>
          <Frame name="Selected badge" flex="row" h={28} gap={4} items="center" py={0} px={10} bg="#2968EC" rounded={999}>
            <Icon name="lucide:check" size={14} color="#FFFFFF" />
            <Text name="Label" color="#FFFFFF" size={12} weight={600} lineHeight={16}>Selected</Text>
          </Frame>
        </Frame>
        <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
          <Frame name="t1" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t2" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t3" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t+n" flex="row" w={64} h={48} justify="center" items="center" bg="#F2F1ED" rounded={8}>
            <Text name="More" color="#6B6B70" weight={600} lineHeight={20}>+3</Text>
          </Frame>
        </Frame>
        <Frame name="Actions" flex="row" w="fill" gap={8}>
          <Frame name="Open" flex="row" h={44} grow={1} gap={6} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
            <Icon name="lucide:maximize-2" size={16} color="#2968EC" />
            <Text name="Label" color="#2968EC" weight={600} lineHeight={20}>Open</Text>
          </Frame>
          <Frame name="Delete" flex="row" h={44} grow={1} gap={6} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
            <Icon name="lucide:trash-2" size={16} color="#C0392B" />
            <Text name="Label" color="#C0392B" weight={600} lineHeight={20}>Delete</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA 'Get my budget' (enabled because Simulation 2 is selected)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Icon name="lucide:receipt-text" size={20} color="#FFFFFF" />
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Get my budget</Text>
    </Frame>
    <Frame name="SecondaryCTA 'Generate more simulations'" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:sparkles" size={20} color="#2968EC" />
      <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Generate more simulations</Text>
    </Frame>
  </Frame>
</Frame>