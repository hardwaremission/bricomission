<Frame name="S9 · Budget – for the selected Simulation (one current Budget; Recalculate; relabel note)" y={1400} flex="col" w={390} bg="#FAFAF8">
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
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your kitchen budget</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Four options from premium to essential, from the elements visible in your simulation. Tap an option to see every item.</Text>
    </Frame>
    <Frame name="Based on card (links to the project page to change the simulation)" flex="col" w="fill" gap={12} p={12} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Frame name="Row" flex="row" w="fill" justify="between" items="center">
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Based on Simulation 2</Text>
        <Text name="Link" color="#2968EC" weight={600} lineHeight={20}>Change</Text>
      </Frame>
      <Frame name="Thumbs (wrap, 6 images)" flex="row" w="fill" gap={8} wrap rowGap={8}>
        <Frame name="t1" w={48} h={36} bg="#CFCBC1" rounded={8} />
        <Frame name="t2" w={48} h={36} bg="#BDB8AC" rounded={8} />
        <Frame name="t3" w={48} h={36} bg="#D9D6CE" rounded={8} />
        <Frame name="t4" w={48} h={36} bg="#CFCBC1" rounded={8} />
        <Frame name="t5" w={48} h={36} bg="#BDB8AC" rounded={8} />
        <Frame name="t6" w={48} h={36} bg="#D9D6CE" rounded={8} />
      </Frame>
    </Frame>
    <Text name="Relabel note (quiet, only when relabeled=true)" w="fill" color="#6B6B70" lineHeight={20}>The options are ordered by total price, from the most to the least expensive.</Text>
    <Frame name="Tier list (4 TierCards as the approved Budget design; collapsed)" flex="col" w="fill" gap={12}>
      <Frame name="TierCard Luxury" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:gem" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Luxury</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€9,860.40</Text>
        <Text name="Meta" color="#6B6B70" lineHeight={20}>14 items · VAT included</Text>
      </Frame>
      <Frame name="TierCard High" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:award" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>High</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€7,215.30</Text>
        <Text name="Meta" color="#6B6B70" lineHeight={20}>14 items · VAT included</Text>
      </Frame>
      <Frame name="TierCard Medium" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:layers" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Medium</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€4,980.00</Text>
        <Text name="Meta" color="#6B6B70" lineHeight={20}>13 items · VAT included</Text>
      </Frame>
      <Frame name="TierCard Low" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:piggy-bank" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Low</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€2,760.00</Text>
        <Text name="Meta" color="#6B6B70" lineHeight={20}>12 items · VAT included</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA 'Back to my kitchen'" flex="row" h={52} w="fill" justify="center" items="center" bg="#2968EC" rounded={999}>
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Back to my kitchen</Text>
    </Frame>
    <Frame name="SecondaryCTA 'Recalculate budget' (keeps the current budget until the new one is ready)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#2968EC" />
      <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Recalculate budget</Text>
    </Frame>
  </Frame>
</Frame>