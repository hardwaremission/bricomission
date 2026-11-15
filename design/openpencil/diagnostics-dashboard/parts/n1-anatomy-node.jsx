<Frame name="Anatomy node llama-server" x={72} y={64} w={312} h={184} bg="#101A2B" stroke="#2A3A55" rounded={8}>
  <Frame name="Header" w={312} h={24} bg="#6D28D9" rounded={8} />
  <Frame name="Header square" y={16} w={312} h={8} bg="#6D28D9" />
  <Text name="Title" x={10} y={5} color="#EDE9FE" size={12} weight="bold" lineHeight={14}>llama-server</Text>
  <Frame name="Badge GPU" x={198} y={4} w={30} h={16} bg="#4C1D95" rounded={999}>
    <Text name="T" x={7} y={2} color="#DDD6FE" size={9} weight="bold" lineHeight={12}>GPU</Text>
  </Frame>
  <Frame name="State chip" x={236} y={4} w={70} h={16} bg="#0F2A1E" stroke="#1F6B45" rounded={999}>
    <Text name="T" x={12} y={2} color="#86EFAC" size={9} weight="bold" lineHeight={12}>LOADED</Text>
  </Frame>
  <Text name="Model" x={12} y={32} color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>Qwen3-VL-30B-A3B-Instruct Q4_K_M</Text>
  <Text name="Vision" x={12} y={49} color="#C4B5FD" size={10} font="JetBrains Mono" lineHeight={13}>+ mmproj F16 (vision) · id qwen3-vl</Text>
  <Text name="Flags" x={12} y={64} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>MoE experts on CPU · ctx 16384 · router</Text>
  <Frame name="Stat CPU" x={12} y={92} w={68} h={34}>
    <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
    <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>3%</Text>
    <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={3} h={3} bg="#5B9BFF" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Stat RAM" x={86} y={92} w={68} h={34}>
    <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
    <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>22.1 GB</Text>
    <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={21} h={3} bg="#4ADE80" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Stat VRAM" x={160} y={92} w={68} h={34}>
    <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
    <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>4.1 GB</Text>
    <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={15} h={3} bg="#A78BFA" rounded={999} />
    </Frame>
  </Frame>
  <Frame name="Stat GPU" x={234} y={92} w={68} h={34}>
    <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
    <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0%</Text>
    <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
      <Frame name="Fill" w={1} h={3} bg="#FACC15" rounded={999} />
    </Frame>
  </Frame>
  <Text name="Last" x={12} y={146} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>idle · last: chat completion 55.7 s</Text>
  <Frame name="Pin in http" x={-5} y={57} w={10} h={10} bg="#4F8EF7" stroke="#0B1220" strokeWidth={2} rounded={999} />
  <Frame name="Pin in llm" x={-5} y={87} w={10} h={10} bg="#A78BFA" stroke="#0B1220" strokeWidth={2} rounded={999} />
</Frame>