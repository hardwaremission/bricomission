<Frame name="2 · Budget tier expanded – Line Items, citations, totals" x={450} flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
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
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Four options, from premium to essential. Prices come from the product catalog; tap an option to see every item.</Text>
    </Frame>
    <Frame name="Tier list" flex="col" w="fill" gap={12}>
      <Frame name="TierCard Medium – expanded (aria-expanded=true, stroke primary 2)" flex="col" w="fill" gap={16} p={16} bg="#FFFFFF" stroke="#2968EC" strokeWidth={2} rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:layers" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Medium</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-up" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€8,215.30</Text>
        <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
        <Frame name="Line Item – Base cabinet 80 cm" flex="col" w="fill" gap={4}>
          <Frame name="Row" flex="row" w="fill" gap={12} justify="between">
            <Text name="Item name" grow={1} color="#182231" size={16} weight={600} lineHeight={24}>Base cabinet 80 cm, oak</Text>
            <Text name="Subtotal" color="#182231" size={16} weight={600} lineHeight={24}>€1,196.00</Text>
          </Frame>
          <Text name="Price × quantity · unit" color="#6B6B70" lineHeight={20}>€299.00 × 4 units · SKU BM-SYN-CAB-080</Text>
          <Frame name="Citation" flex="row" gap={6} items="center">
            <Icon name="lucide:book-open" size={14} color="#6B6B70" />
            <Text name="Citation text" color="#6B6B70" size={12} lineHeight={16}>Sample Catalog, page 3</Text>
          </Frame>
        </Frame>
        <Frame name="Line Item – Worktop 300 cm" flex="col" w="fill" gap={4}>
          <Frame name="Row" flex="row" w="fill" gap={12} justify="between">
            <Text name="Item name" grow={1} color="#182231" size={16} weight={600} lineHeight={24}>Quartz worktop, 300 cm</Text>
            <Text name="Subtotal" color="#182231" size={16} weight={600} lineHeight={24}>€1,899.00</Text>
          </Frame>
          <Text name="Price × quantity · unit" color="#6B6B70" lineHeight={20}>€189.90 × 10 m · SKU BM-SYN-WTP-300</Text>
          <Frame name="Citation" flex="row" gap={6} items="center">
            <Icon name="lucide:book-open" size={14} color="#6B6B70" />
            <Text name="Citation text" color="#6B6B70" size={12} lineHeight={16}>Sample Catalog, page 5</Text>
          </Frame>
        </Frame>
        <Frame name="Line Item – Single-bowl sink" flex="col" w="fill" gap={4}>
          <Frame name="Row" flex="row" w="fill" gap={12} justify="between">
            <Text name="Item name" grow={1} color="#182231" size={16} weight={600} lineHeight={24}>Stainless single-bowl sink</Text>
            <Text name="Subtotal" color="#182231" size={16} weight={600} lineHeight={24}>€214.50</Text>
          </Frame>
          <Text name="Price × quantity · unit" color="#6B6B70" lineHeight={20}>€214.50 × 1 unit · SKU BM-SYN-SNK-001</Text>
          <Frame name="Citation" flex="row" gap={6} items="center">
            <Icon name="lucide:book-open" size={14} color="#6B6B70" />
            <Text name="Citation text" color="#6B6B70" size={12} lineHeight={16}>Sample Catalog, page 7</Text>
          </Frame>
        </Frame>
        <Text name="More items hint" color="#6B6B70" lineHeight={20}>+ 10 more items</Text>
        <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
        <Frame name="Totals block" flex="col" w="fill" gap={8}>
          <Frame name="Row Subtotal" flex="row" w="fill" justify="between">
            <Text name="Label" color="#6B6B70" lineHeight={20}>Subtotal (before VAT)</Text>
            <Text name="Value" color="#182231" weight={600} lineHeight={20}>€6,789.31</Text>
          </Frame>
          <Frame name="Row VAT" flex="row" w="fill" justify="between">
            <Text name="Label" color="#6B6B70" lineHeight={20}>VAT 21%</Text>
            <Text name="Value" color="#182231" weight={600} lineHeight={20}>€1,425.89</Text>
          </Frame>
          <Frame name="Row Total" flex="row" w="fill" justify="between">
            <Text name="Label" color="#182231" size={16} weight={600} lineHeight={24}>Total (VAT included)</Text>
            <Text name="Value" color="#182231" size={16} weight="bold" lineHeight={24}>€8,215.30</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame name="TierCard Low (collapsed)" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
        <Frame name="Top row" flex="row" w="fill" justify="between" items="center">
          <Frame name="Tier label" flex="row" gap={8} items="center">
            <Icon name="lucide:piggy-bank" size={20} color="#2968EC" />
            <Text name="Tier name" color="#182231" size={18} weight={600} lineHeight={24}>Low</Text>
          </Frame>
          <Frame name="Chevron hit area" flex="row" w={44} h={44} justify="center" items="center">
            <Icon name="lucide:chevron-down" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
        <Text name="Tier total" color="#182231" size={28} weight="bold" lineHeight={34}>€4,760.00</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>