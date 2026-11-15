<Frame name="L2 · Budget prompt expanded (long payload) and kind filter menu" x={680} flex="row" gap={24} p={20} bg="#0E1626">
  <Frame name="Budget prompt row (EXPANDED, scrolls inside the payload)" flex="row" w={600} h={640} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Kind bar" w={3} h={640} bg="#A78BFA" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={8} py={10} px={12}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:04:12.440</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>ai-adapters</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#1E1740" rounded={999}>
          <Text name="T" color="#C4B5FD" size={11} weight={600} lineHeight={14}>llama-server</Text>
        </Frame>
        <Frame name="Spacer" w={246} h={1} grow={1} />
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#1E1740" rounded={4}>
          <Text name="T" color="#C4B5FD" size={9} weight="bold" lineHeight={12}>LLM</Text>
        </Frame>
        <Icon name="lucide:chevron-up" size={14} color="#9DB4D8" />
      </Frame>
      <Text name="Summary" w="fill" color="#E6EDF7" size={12} weight={600} lineHeight={16}>chat completion · task budget · attempt 1 of 3 · model qwen3-vl</Text>
      <Frame name="Toolbar" flex="row" w="fill" gap={8} items="center">
        <Text name="Tokens" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>1,234 prompt tokens · schema budget_tiers · maxTokens 1500</Text>
        <Frame name="Spacer" w={86} h={1} grow={1} />
        <Frame name="Wrap" flex="row" h={22} gap={4} items="center" py={0} px={8} bg="#16233A" stroke="#2A3A55" rounded={6}>
          <Icon name="lucide:wrap-text" size={12} color="#9DB4D8" />
          <Text name="T" color="#CBD5E1" size={10} weight={600} lineHeight={13}>Wrap</Text>
        </Frame>
        <Frame name="Copy" flex="row" h={22} gap={4} items="center" py={0} px={8} bg="#16233A" stroke="#2A3A55" rounded={6}>
          <Icon name="lucide:copy" size={12} color="#9DB4D8" />
          <Text name="T" color="#CBD5E1" size={10} weight={600} lineHeight={13}>Copy</Text>
        </Frame>
      </Frame>
      <Frame name="Payload (scrolls)" flex="col" w="fill" gap={8} p={12} bg="#0A1020" stroke="#1C2A44" rounded={6}>
        <Text name="System label" color="#A78BFA" size={10} font="JetBrains Mono" weight="bold" lineHeight={13}>SYSTEM</Text>
        <Text name="System" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>You extract priced Line Items from catalog excerpts. You never compute an amount. For each of the four tiers (luxury, high, medium, low) return at most 5 items with name, sku, chunkRef, quotedPrice (exactly as printed), quantity and unit. Use only the excerpts below.</Text>
        <Text name="Inventory label" color="#A78BFA" size={10} font="JetBrains Mono" weight="bold" lineHeight={13}>USER · INVENTORY SEEN IN THE 6 IMAGES</Text>
        <Text name="Inventory" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>base cabinets 4 · wall cabinets 3 · tall cabinet 1 · worktop 1 · sink 1 · tap 1 · hob 1 · hood 1 · splashback 1 · handles 12</Text>
        <Text name="Bands label" color="#A78BFA" size={10} font="JetBrains Mono" weight="bold" lineHeight={13}>PRICE BANDS (hints computed in code)</Text>
        <Text name="Bands" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>worktop: BM-SYN-WTP-300 premium · cabinets: BM-SYN-CAB-060 mid, BM-SYN-CAB-040 basic · tap: BM-SYN-TAP-200 mid</Text>
        <Text name="Chunks label" color="#A78BFA" size={10} font="JetBrains Mono" weight="bold" lineHeight={13}>RETRIEVED EXCERPTS (30 chunks, 12,000 characters)</Text>
        <Text name="Chunk 1" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>[source 1] BM-SYN-WTP-300 | Oak laminate worktop 300 cm | 189.90 EUR</Text>
        <Text name="Chunk 2" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>[source 2] BM-SYN-CAB-060 | Base cabinet 60 cm, white | 129.00 EUR</Text>
        <Text name="Chunk 3" w="fill" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={15}>[source 3] BM-SYN-TAP-200 | Single-lever tap, chrome | 74.90 EUR</Text>
        <Text name="More" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={14}>… 27 more excerpts (scroll)</Text>
        <Text name="Footer" w="fill" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={14}>The model answers with JSON only; code then verifies every quoted price against its excerpt and computes all amounts (ADR 0002).</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Kind filter menu (opened from +7)" flex="col" w={230} gap={2} p={8} bg="#0E1626" stroke="#2A3A55" rounded={10} shadow="0 8 24 #00000066">
    <Text name="Title" color="#8A9BB5" size={10} weight="bold" lineHeight={13}>EVENT KINDS</Text>
    <Frame name="Opt http" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#4F8EF7" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>http</Text>
    </Frame>
    <Frame name="Opt auth" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#F87171" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>auth</Text>
    </Frame>
    <Frame name="Opt guard" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#5EEAD4" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>guard</Text>
    </Frame>
    <Frame name="Opt sql" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#F5A524" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>sql</Text>
    </Frame>
    <Frame name="Opt object" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#FB923C" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>object</Text>
    </Frame>
    <Frame name="Opt llm" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#A78BFA" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>llm</Text>
    </Frame>
    <Frame name="Opt image" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#F472B6" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>image</Text>
    </Frame>
    <Frame name="Opt embed" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#22D3EE" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>embed</Text>
    </Frame>
    <Frame name="Opt queue" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#FACC15" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>queue</Text>
    </Frame>
    <Frame name="Opt residency" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#FACC15" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>residency</Text>
    </Frame>
    <Frame name="Opt step" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#94A3B8" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>step</Text>
    </Frame>
    <Frame name="Opt compute" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#5EEAD4" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>compute</Text>
    </Frame>
    <Frame name="Opt mail" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#4ADE80" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>mail</Text>
    </Frame>
    <Frame name="Opt session" flex="row" h={30} gap={8} items="center" py={0} px={6}>
      <Frame name="Check" flex="row" w={16} h={16} justify="center" items="center" bg="#2968EC" rounded={4}>
        <Icon name="lucide:check" size={11} color="#FFFFFF" />
      </Frame>
      <Frame name="Dot" w={8} h={8} bg="#F5A524" rounded={999} />
      <Text name="T" color="#CBD5E1" size={12} lineHeight={16}>session</Text>
    </Frame>
    <Text name="Note" w="fill" color="#8A9BB5" size={10} lineHeight={14}>Selecting a node in the graph also filters the log to the events that involve it (clear with Esc).</Text>
  </Frame>
</Frame>