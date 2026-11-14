<Frame name="S4 · AI Results – Simulation succeeded (slider keeps its position across Renders; wrapping photo grid; history grouped by Simulation)" x={450} y={1100} flex="col" w={390} bg="#FAFAF8">
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
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Simulation 2</Text>
      <Text name="Helper (style summary)" w="fill" color="#6B6B70" size={16} lineHeight={24}>Calculated style from Scandinavian, Mediterranean and 3 of your photos. Photo 3 of 6. Drag the handle to compare.</Text>
    </Frame>
    <Frame name="BeforeAfterSlider (role=slider; value kept when another Render is shown; Home and End show only After or only Before)" w={358} h={245} bg="#CFCBC1" rounded={20}>
      <Frame name="Before layer (clipped to the handle position)" w={179} h={245} bg="#BDB8AC" rounded={20} />
      <Frame name="Divider line" x={178} w={2} h={245} bg="#FFFFFF" />
      <Frame name="Handle (44 hit area, visual 40)" x={159} y={100} flex="row" w={40} h={40} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
        <Icon name="lucide:chevrons-left-right" size={20} color="#182231" />
      </Frame>
      <Frame name="Label Before" x={12} y={12} flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Before</Text>
      </Frame>
      <Frame name="Label After" x={300} y={12} flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>After</Text>
      </Frame>
    </Frame>
    <Frame name="Section Photos in this simulation (radiogroup; tapping shows that Render; grid wraps, no horizontal scroll)" flex="col" w="fill" gap={12}>
      <Frame name="Header" flex="col" w="fill" gap={4}>
        <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Photos in this simulation</Text>
        <Text name="Helper" w="fill" color="#6B6B70" lineHeight={20}>Every photo is rendered with the same calculated style.</Text>
      </Frame>
      <Frame name="Photo grid (wrap, gap 12, 4:3 thumbs 110x82, radius 12)" flex="row" w="fill" gap={12} wrap rowGap={12}>
        <Frame name="Photo 1" w={110} h={82} bg="#D9D6CE" rounded={12} />
        <Frame name="Photo 2" w={110} h={82} bg="#CFCBC1" rounded={12} />
        <Frame name="Photo 3 – shown (aria-checked)" flex="row" w={110} h={82} justify="end" p={4} bg="#BDB8AC" stroke="#2968EC" strokeWidth={3} rounded={12}>
          <Frame name="Selected badge" flex="row" w={24} h={24} justify="center" items="center" bg="#2968EC" rounded={999}>
            <Icon name="lucide:check" size={14} color="#FFFFFF" />
          </Frame>
        </Frame>
        <Frame name="Photo 4" w={110} h={82} bg="#D9D6CE" rounded={12} />
        <Frame name="Photo 5" w={110} h={82} bg="#CFCBC1" rounded={12} />
        <Frame name="Photo 6" w={110} h={82} bg="#BDB8AC" rounded={12} />
      </Frame>
    </Frame>
    <Frame name="Section Your simulations (grouped; each group is a button that opens it)" flex="col" w="fill" gap={12}>
      <Frame name="Header" flex="row" w="fill" justify="between" items="center">
        <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Your simulations</Text>
        <Text name="Counter" color="#6B6B70" weight={600} lineHeight={20}>3</Text>
      </Frame>
      <Frame name="Group Simulation 3" flex="col" w="fill" gap={8} p={12} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
        <Text name="Group title" color="#182231" weight={600} lineHeight={20}>Simulation 3</Text>
        <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
          <Frame name="t1" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t2" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t3" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t4" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t5" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t6" w={64} h={48} bg="#BDB8AC" rounded={8} />
        </Frame>
      </Frame>
      <Frame name="Group Simulation 2 – shown (3 px primary stroke, aria-current)" flex="col" w="fill" gap={8} p={12} bg="#FFFFFF" stroke="#2968EC" strokeWidth={3} rounded={16}>
        <Text name="Group title" color="#182231" weight={600} lineHeight={20}>Simulation 2</Text>
        <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
          <Frame name="t1" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t2" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t3" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t4" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t5" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t6" w={64} h={48} bg="#D9D6CE" rounded={8} />
        </Frame>
      </Frame>
      <Frame name="Group Simulation 1" flex="col" w="fill" gap={8} p={12} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
        <Text name="Group title" color="#182231" weight={600} lineHeight={20}>Simulation 1</Text>
        <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
          <Frame name="t1" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t2" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t3" w={64} h={48} bg="#CFCBC1" rounded={8} />
          <Frame name="t4" w={64} h={48} bg="#BDB8AC" rounded={8} />
          <Frame name="t5" w={64} h={48} bg="#D9D6CE" rounded={8} />
          <Frame name="t6" w={64} h={48} bg="#CFCBC1" rounded={8} />
        </Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA 'Generate again' (new calculated style, new Simulation)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#FFFFFF" />
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Generate again</Text>
    </Frame>
    <Frame name="SecondaryCTA 'Back to my kitchen'" flex="row" h={52} w="fill" justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Back to my kitchen</Text>
    </Frame>
  </Frame>
</Frame>