<Frame name="Widget variants row" x={48} y={486} flex="row" gap={20}>
  <Frame name="Widget normal" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Text name="Label" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM · normal</Text>
    <Text name="V" color="#E6EDF7" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>4.1 GB</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={46} h={4} bg="#A78BFA" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Widget high load" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#7F1D1D" rounded={8}>
    <Text name="Label" color="#FCA5A5" size={9} weight={600} lineHeight={11}>VRAM · 90 percent or more</Text>
    <Text name="V" color="#FCA5A5" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>15.8 GB</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={170} h={4} bg="#EF4444" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Widget approx" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Row" flex="row" w="fill" justify="between" items="center">
      <Text name="Label" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU · approx</Text>
      <Frame name="Tag" flex="row" h={14} items="center" py={0} px={6} bg="#2A2508" rounded={4}>
        <Text name="T" color="#FACC15" size={8} weight="bold" lineHeight={10}>APPROX</Text>
      </Frame>
    </Frame>
    <Text name="V" color="#E6EDF7" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>~62%</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={110} h={4} bg="#FACC15" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Widget shared" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Row" flex="row" w="fill" justify="between" items="center">
      <Text name="Label" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU · API module</Text>
      <Frame name="Tag" flex="row" h={14} items="center" py={0} px={6} bg="#0C2A2D" rounded={4}>
        <Text name="T" color="#5EEAD4" size={8} weight="bold" lineHeight={10}>SHARED</Text>
      </Frame>
    </Frame>
    <Text name="V" color="#E6EDF7" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>3%</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={6} h={4} bg="#5B9BFF" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Widget n/a" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Text name="Label" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM · not measurable</Text>
    <Text name="V" color="#64748B" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>n/a</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999} />
  </Frame>
  <Frame name="Widget no agent" flex="col" w={200} gap={6} p={10} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Row" flex="row" w="fill" justify="between" items="center">
      <Text name="Label" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM · agent down</Text>
      <Frame name="Tag" flex="row" h={14} items="center" py={0} px={6} bg="#1E293B" rounded={4}>
        <Text name="T" color="#94A3B8" size={8} weight="bold" lineHeight={10}>NO AGENT</Text>
      </Frame>
    </Frame>
    <Text name="V" color="#64748B" size={13} font="JetBrains Mono" weight="bold" lineHeight={16}>—</Text>
    <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999} />
  </Frame>
</Frame>