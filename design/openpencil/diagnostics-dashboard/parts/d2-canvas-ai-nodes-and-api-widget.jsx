<Frame name="AI nodes and API widget" w={1360} h={1024}>
  <Frame name="Node llama-server" x={1040} y={262} w={312} h={140} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={312} h={24} bg="#6D28D9" rounded={8} />
    <Frame name="Header square" y={16} w={312} h={8} bg="#6D28D9" />
    <Text name="Title" x={10} y={5} color="#EDE9FE" size={12} weight="bold" lineHeight={14}>llama-server</Text>
    <Frame name="Badge GPU" x={198} y={4} w={30} h={16} bg="#4C1D95" rounded={999}>
      <Text name="T" x={7} y={2} color="#DDD6FE" size={9} weight="bold" lineHeight={12}>GPU</Text>
    </Frame>
    <Frame name="State chip" x={236} y={4} w={70} h={16} bg="#2A220F" stroke="#7A5C1A" rounded={999}>
      <Text name="T" x={12} y={2} color="#FBBF24" size={9} weight="bold" lineHeight={12}>UNLOADED</Text>
    </Frame>
    <Text name="Model" x={12} y={30} color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>Qwen3-VL-30B-A3B-Instruct Q4_K_M</Text>
    <Text name="Vision" x={12} y={46} color="#C4B5FD" size={10} font="JetBrains Mono" lineHeight={13}>+ mmproj F16 (vision) · id qwen3-vl</Text>
    <Text name="Flags" x={12} y={60} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>MoE experts on CPU · ctx 16384 · router</Text>
    <Frame name="Stat CPU" x={12} y={80} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>1%</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={3} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={86} y={80} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0.5 GB</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={21} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat VRAM" x={160} y={80} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0.2 GB</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={15} h={3} bg="#A78BFA" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat GPU" x={234} y={80} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0%</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={1} h={3} bg="#FACC15" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Last" x={12} y={120} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>unloaded before the render · reload ~7 s</Text>
    <Frame name="Pin in http" x={-5} y={57} w={10} h={10} bg="#4F8EF7" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin in llm" x={-5} y={99} w={10} h={10} bg="#A78BFA" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node comfyui" x={1040} y={418} w={312} h={160} bg="#101A2B" stroke="#5B9BFF" strokeWidth={2} rounded={8}>
    <Frame name="Header" w={312} h={24} bg="#6D28D9" rounded={8} />
    <Frame name="Header square" y={16} w={312} h={8} bg="#6D28D9" />
    <Text name="Title" x={10} y={5} color="#EDE9FE" size={12} weight="bold" lineHeight={14}>comfyui</Text>
    <Frame name="Badge GPU" x={198} y={4} w={30} h={16} bg="#4C1D95" rounded={999}>
      <Text name="T" x={7} y={2} color="#DDD6FE" size={9} weight="bold" lineHeight={12}>GPU</Text>
    </Frame>
    <Frame name="State chip" x={236} y={4} w={70} h={16} bg="#0F1F3A" stroke="#2968EC" rounded={999}>
      <Text name="T" x={18} y={2} color="#7FB0FF" size={9} weight="bold" lineHeight={12}>BUSY</Text>
    </Frame>
    <Text name="Checkpoint" x={12} y={30} color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>RealVisXL_V5.0_fp16 (SDXL)</Text>
    <Text name="ControlNet" x={12} y={46} color="#C4B5FD" size={10} font="JetBrains Mono" lineHeight={13}>ControlNet sdxl-canny + sdxl-depth</Text>
    <Text name="IPAdapter" x={12} y={60} color="#C4B5FD" size={10} font="JetBrains Mono" lineHeight={13}>IP-Adapter plus_sdxl_vit-h</Text>
    <Text name="Clip" x={12} y={74} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>CLIP vision ViT-H-14 laion2B</Text>
    <Frame name="Stat CPU" x={12} y={94} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>41%</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={2} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={86} y={94} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>5.6 GB</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={5} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat VRAM" x={160} y={94} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>12.3 GB</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={17} h={3} bg="#A78BFA" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat GPU" x={234} y={94} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>87%</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={1} h={3} bg="#FACC15" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Last" x={12} y={136} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>RENDERING photo 3 of 6 · 7.2 s elapsed</Text>
    <Frame name="Pin in image" x={-5} y={55} w={10} h={10} bg="#F472B6" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node embedder" x={1040} y={594} w={312} h={112} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={312} h={24} bg="#0E7490" rounded={8} />
    <Frame name="Header square" y={16} w={312} h={8} bg="#0E7490" />
    <Text name="Title" x={10} y={5} color="#CFFAFE" size={12} weight="bold" lineHeight={14}>embedder</Text>
    <Frame name="Badge CPU" x={262} y={4} w={30} h={16} bg="#164E63" rounded={999}>
      <Text name="T" x={7} y={2} color="#A5F3FC" size={9} weight="bold" lineHeight={12}>CPU</Text>
    </Frame>
    <Text name="Model" x={12} y={30} color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>Qwen3-Embedding-0.6B Q8_0</Text>
    <Text name="Dims" x={12} y={46} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>1024 dimensions · llama.cpp CPU only</Text>
    <Frame name="Stat CPU" x={12} y={68} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>1%</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={2} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={86} y={68} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>1.1 GB</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={4} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat VRAM" x={160} y={68} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Frame name="Stat GPU" x={234} y={68} w={68} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
      <Frame name="Track" y={29} w={60} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Frame name="Pin in embed" x={-5} y={55} w={10} h={10} bg="#22D3EE" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="API container widget (totals shared by every module)" x={340} y={46} w={128} h={96} bg="#101A2B" stroke="#0F5456" rounded={8}>
    <Text name="Label" x={10} y={8} color="#5EEAD4" size={9} weight="bold" lineHeight={12}>API TOTALS · shared</Text>
    <Frame name="Stat CPU" x={10} y={28} w={50} h={28}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>3%</Text>
    </Frame>
    <Frame name="Stat RAM" x={68} y={28} w={54} h={28}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>410 MB</Text>
    </Frame>
    <Frame name="Stat VRAM" x={10} y={62} w={50} h={28}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
    </Frame>
    <Frame name="Stat GPU" x={68} y={62} w={54} h={28}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
    </Frame>
  </Frame>
</Frame>