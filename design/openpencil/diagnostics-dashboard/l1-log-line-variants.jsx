<Frame name="L1 · Log line variants (annotation text is normative)" flex="col" w={600} gap={8} p={20} bg="#0E1626">
  <Text name="Annotation" w="fill" color="#8A9BB5" size={11} lineHeight={16}>Row anatomy: kind bar (3 px, pin-type colour) · time (mono) · FROM chip (node category colour) · arrow · TO chip · optional ms · KIND badge. Second line: the summary in plain words. Expanded rows add a payload box (mono, scrolls, Copy button). Rows are 58 px collapsed. The newest row is at the bottom; the log auto-scrolls until the user scrolls up (then Jump to live appears).</Text>
  <Frame name="Thread header (correlation id)" flex="row" w="fill" gap={8} items="center">
    <Frame name="Line" w={12} h={1} bg="#2A3A55" />
    <Frame name="Tag" flex="row" h={20} gap={6} items="center" py={0} px={8} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Icon name="lucide:git-commit-horizontal" size={12} color="#9DB4D8" />
      <Text name="T" color="#9DB4D8" size={10} font="JetBrains Mono" weight="bold" lineHeight={13}>sim-7f3a · POST /simulations · 14:02:31</Text>
    </Frame>
    <Frame name="Line" w={264} h={1} grow={1} bg="#2A3A55" />
  </Frame>
  <Frame name="Row sql coalesced group" flex="row" h={58} w="fill" bg="#101A2B" rounded={8}>
    <Frame name="Kind bar" w={3} h={58} bg="#F5A524" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={5} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:02:31.505</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>data-access</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#2A2010" rounded={999}>
          <Text name="T" color="#FBBF24" size={11} weight={600} lineHeight={14}>postgres</Text>
        </Frame>
        <Frame name="Spacer" w={177} h={1} grow={1} />
        <Text name="Ms" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>41 ms</Text>
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#2A2010" rounded={4}>
          <Text name="T" color="#F5A524" size={9} weight="bold" lineHeight={12}>SQL x8</Text>
        </Frame>
        <Icon name="lucide:chevron-down" size={14} color="#9DB4D8" />
      </Frame>
      <Text name="Summary" w="fill" color="#CBD5E1" size={12} lineHeight={16}>Simulation.create, Render.create x6, PlatformSetting read (grouped within 250 ms)</Text>
    </Frame>
  </Frame>
  <Frame name="Row vector search (EXPANDED, hits)" flex="row" h={176} w="fill" bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Kind bar" w={3} h={176} bg="#F5A524" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={6} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:03:40.210</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>catalog-search</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#2A2010" rounded={999}>
          <Text name="T" color="#FBBF24" size={11} weight={600} lineHeight={14}>postgres</Text>
        </Frame>
        <Frame name="Spacer" w={202} h={1} grow={1} />
        <Text name="Ms" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>9 ms</Text>
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#2A2010" rounded={4}>
          <Text name="T" color="#F5A524" size={9} weight="bold" lineHeight={12}>SQL</Text>
        </Frame>
      </Frame>
      <Text name="Summary" w="fill" color="#E6EDF7" size={12} weight={600} lineHeight={16}>catalog vector search (HNSW cosine, top 5) · query: quartz worktop</Text>
      <Frame name="Payload" flex="col" w="fill" gap={3} p={10} bg="#0A1020" stroke="#1C2A44" rounded={6}>
        <Text name="H" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={14}>hit  catalog · page · score · sku</Text>
        <Text name="H1" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={14}>1  sample catalog · p3 · 0.81 · BM-SYN-WTP-300</Text>
        <Text name="H2" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={14}>2  sample catalog · p3 · 0.74 · BM-SYN-SPL-TIL</Text>
        <Text name="H3" color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={14}>3  sample catalog · p2 · 0.69 · BM-SYN-CAB-060</Text>
        <Text name="H4" color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={14}>+ 2 more hits</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Row compute budget-math" flex="row" h={58} w="fill" bg="#101A2B" rounded={8}>
    <Frame name="Kind bar" w={3} h={58} bg="#5EEAD4" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={5} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:04:42.980</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>budget-engine</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>budget-math</Text>
        </Frame>
        <Frame name="Spacer" w={183} h={1} grow={1} />
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#0C2A2D" rounded={4}>
          <Text name="T" color="#5EEAD4" size={9} weight="bold" lineHeight={12}>COMPUTE</Text>
        </Frame>
      </Frame>
      <Text name="Summary" w="fill" color="#CBD5E1" size={12} lineHeight={16}>attempt 1 of 3 · 15 items verified, 1 rejected (price not on the SKU line) · tiers ordered</Text>
    </Frame>
  </Frame>
  <Frame name="Row mail (inferred)" flex="row" h={58} w="fill" bg="#101A2B" rounded={8}>
    <Frame name="Kind bar" w={3} h={58} bg="#4ADE80" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={5} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:01:12.330</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#2A1220" rounded={999}>
          <Text name="T" color="#FB7185" size={11} weight={600} lineHeight={14}>keycloak</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#2A1220" rounded={999}>
          <Text name="T" color="#FB7185" size={11} weight={600} lineHeight={14}>mailpit</Text>
        </Frame>
        <Frame name="Spacer" w={210} h={1} grow={1} />
        <Frame name="Inferred" flex="row" h={16} items="center" py={0} px={6} bg="#1E293B" rounded={4}>
          <Text name="T" color="#94A3B8" size={9} weight="bold" lineHeight={12}>INFERRED</Text>
        </Frame>
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#0F2A1E" rounded={4}>
          <Text name="T" color="#4ADE80" size={9} weight="bold" lineHeight={12}>MAIL</Text>
        </Frame>
      </Frame>
      <Text name="Summary" w="fill" color="#CBD5E1" size={12} lineHeight={16}>email code sent to b***@example.com (subject only, never the code)</Text>
    </Frame>
  </Frame>
  <Frame name="Row error" flex="row" h={58} w="fill" bg="#1A1017" stroke="#7F1D1D" rounded={8}>
    <Frame name="Kind bar" w={3} h={58} bg="#EF4444" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={5} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#FCA5A5" size={10} font="JetBrains Mono" lineHeight={13}>14:05:12.004</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>ai-adapters</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#1E1740" rounded={999}>
          <Text name="T" color="#C4B5FD" size={11} weight={600} lineHeight={14}>comfyui</Text>
        </Frame>
        <Frame name="Spacer" w={206} h={1} grow={1} />
        <Text name="Ms" color="#FCA5A5" size={10} font="JetBrains Mono" lineHeight={13}>120 s</Text>
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#7F1D1D" rounded={4}>
          <Text name="T" color="#FEE2E2" size={9} weight="bold" lineHeight={12}>FAILED</Text>
        </Frame>
      </Frame>
      <Text name="Summary" w="fill" color="#FCA5A5" size={12} weight={600} lineHeight={16}>failed (timeout) · ok false · the Render stays failed, Retry available</Text>
    </Frame>
  </Frame>
  <Frame name="Row gap (coalesced polling)" flex="row" h={30} w="fill" gap={8} items="center" py={0} px={10} bg="#0E1626" stroke="#1C2A44" rounded={8}>
    <Icon name="lucide:ellipsis" size={14} color="#64748B" />
    <Text name="T" color="#8A9BB5" size={11} lineHeight={14}>128 poll events grouped (GET /simulations/:id every 2 s)</Text>
  </Frame>
  <Frame name="Row system" flex="row" h={58} w="fill" bg="#101A2B" rounded={8}>
    <Frame name="Kind bar" w={3} h={58} bg="#94A3B8" rounded={2} />
    <Frame name="Body" flex="col" grow={1} gap={5} py={8} px={10}>
      <Frame name="Line" flex="row" w="fill" gap={6} items="center">
        <Text name="Time" color="#64748B" size={10} font="JetBrains Mono" lineHeight={13}>14:10:00.000</Text>
        <Frame name="From" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>project-service</Text>
        </Frame>
        <Icon name="lucide:arrow-right" size={12} color="#64748B" />
        <Frame name="To" flex="row" h={20} items="center" py={0} px={8} bg="#0C2A2D" rounded={999}>
          <Text name="T" color="#5EEAD4" size={11} weight={600} lineHeight={14}>storage-client</Text>
        </Frame>
        <Frame name="Spacer" w={141} h={1} grow={1} />
        <Frame name="Tag" flex="row" h={16} items="center" py={0} px={6} bg="#1E293B" rounded={4}>
          <Text name="T" color="#94A3B8" size={9} weight="bold" lineHeight={12}>SYSTEM</Text>
        </Frame>
        <Frame name="Kind" flex="row" h={16} items="center" py={0} px={6} bg="#1E293B" rounded={4}>
          <Text name="T" color="#94A3B8" size={9} weight="bold" lineHeight={12}>STEP</Text>
        </Frame>
      </Frame>
      <Text name="Summary" w="fill" color="#CBD5E1" size={12} lineHeight={16}>sweeper deleted 3 expired drafts and 11 objects (no correlation id: system)</Text>
    </Frame>
  </Frame>
</Frame>