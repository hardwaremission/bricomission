<Frame name="S6 · AI Results @360x780 check (compact selector Nederlands, slider 328x224, 8 photos = 3 flexible columns 101x76, no horizontal overflow)" x={1400} y={1100} flex="col" w={360} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector compact (below 375px)" flex="row" h={44} gap={4} items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={16} color="#182231" />
        <Text name="Current language" color="#182231" size={12} weight={600} lineHeight={16}>Nederlands</Text>
        <Icon name="lucide:chevron-down" size={14} color="#182231" />
      </Frame>
      <Frame name="AccountEntry" flex="row" w={44} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Initial" color="#FFFFFF" size={16} weight={600} lineHeight={24}>M</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Simulatie 2</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Berekende stijl uit 2 galerijstijlen en 3 van je foto's. Foto 5 van 8.</Text>
    </Frame>
    <Frame name="BeforeAfterSlider 328x224" w={328} h={224} bg="#CFCBC1" rounded={20}>
      <Frame name="Before layer" w={164} h={224} bg="#BDB8AC" rounded={20} />
      <Frame name="Divider line" x={163} w={2} h={224} bg="#FFFFFF" />
      <Frame name="Handle" x={144} y={92} flex="row" w={40} h={40} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
        <Icon name="lucide:chevrons-left-right" size={20} color="#182231" />
      </Frame>
    </Frame>
    <Frame name="Photo grid 8 (3 flexible columns, gap 12, 4:3)" flex="row" w="fill" gap={12} wrap rowGap={12}>
      <Frame name="P1" w={101} h={76} bg="#D9D6CE" rounded={12} />
      <Frame name="P2" w={101} h={76} bg="#CFCBC1" rounded={12} />
      <Frame name="P3" w={101} h={76} bg="#BDB8AC" rounded={12} />
      <Frame name="P4" w={101} h={76} bg="#D9D6CE" rounded={12} />
      <Frame name="P5 shown" flex="row" w={101} h={76} justify="end" p={4} bg="#CFCBC1" stroke="#2968EC" strokeWidth={3} rounded={12}>
        <Frame name="Badge" flex="row" w={24} h={24} justify="center" items="center" bg="#2968EC" rounded={999}>
          <Icon name="lucide:check" size={14} color="#FFFFFF" />
        </Frame>
      </Frame>
      <Frame name="P6" w={101} h={76} bg="#BDB8AC" rounded={12} />
      <Frame name="P7" w={101} h={76} bg="#D9D6CE" rounded={12} />
      <Frame name="P8" w={101} h={76} bg="#CFCBC1" rounded={12} />
    </Frame>
    <Frame name="Group Simulation 1 (thumbs 4 per row)" flex="col" w="fill" gap={8} p={12} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Text name="Group title" color="#182231" weight={600} lineHeight={20}>Simulatie 1</Text>
      <Frame name="Thumbs (wrap)" flex="row" w="fill" gap={8} wrap rowGap={8}>
        <Frame name="t1" w={64} h={48} bg="#BDB8AC" rounded={8} />
        <Frame name="t2" w={64} h={48} bg="#D9D6CE" rounded={8} />
        <Frame name="t3" w={64} h={48} bg="#CFCBC1" rounded={8} />
        <Frame name="t4" w={64} h={48} bg="#BDB8AC" rounded={8} />
        <Frame name="t5" w={64} h={48} bg="#D9D6CE" rounded={8} />
        <Frame name="t6" w={64} h={48} bg="#CFCBC1" rounded={8} />
        <Frame name="t7" w={64} h={48} bg="#BDB8AC" rounded={8} />
        <Frame name="t8" w={64} h={48} bg="#D9D6CE" rounded={8} />
      </Frame>
    </Frame>
  </Frame>
</Frame>