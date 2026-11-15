<Frame name="Container nodes (support)" w={1360} h={1024}>
  <Frame name="Node browser" x={8} y={410} w={108} h={100} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={108} h={24} bg="#475569" rounded={8} />
    <Frame name="Header square" y={16} w={108} h={8} bg="#475569" />
    <Text name="Title" x={10} y={5} color="#E2E8F0" size={11} weight="bold" lineHeight={14}>Browser PWA</Text>
    <Text name="Sub" x={10} y={32} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>client device</Text>
    <Text name="Widget n/a" x={10} y={54} color="#7E8DA6" size={10} font="JetBrains Mono" lineHeight={13}>metrics: n/a</Text>
    <Text name="Stat" x={10} y={72} color="#7FA8F5" size={10} font="JetBrains Mono" lineHeight={13}>portrait app</Text>
    <Frame name="Pin out http" x={103} y={45} w={10} h={10} bg="#4F8EF7" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node web" x={156} y={360} w={140} h={200} bg="#101A2B" stroke="#5B9BFF" strokeWidth={2} rounded={8}>
    <Frame name="Header" w={140} h={24} bg="#2968EC" rounded={8} />
    <Frame name="Header square" y={16} w={140} h={8} bg="#2968EC" />
    <Text name="Title" x={10} y={5} color="#FFFFFF" size={12} weight="bold" lineHeight={14}>web</Text>
    <Text name="Kind" x={74} y={7} color="#CFE0FF" size={9} weight="bold" lineHeight={12}>NEXT.JS BFF</Text>
    <Text name="Sub" x={10} y={32} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>session, proxy /api</Text>
    <Frame name="Stat CPU" x={10} y={52} w={58} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>1%</Text>
      <Frame name="Track" y={29} w={52} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={3} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={76} y={52} w={58} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>180 MB</Text>
      <Frame name="Track" y={29} w={52} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={5} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat VRAM" x={10} y={92} w={58} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>VRAM</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
      <Frame name="Track" y={29} w={52} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Frame name="Stat GPU" x={76} y={92} w={58} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>GPU</Text>
      <Text name="V" y={11} color="#7E8DA6" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>n/a</Text>
      <Frame name="Track" y={29} w={52} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Text name="Counter" x={10} y={146} color="#7FA8F5" size={10} font="JetBrains Mono" lineHeight={13}>proxied 42 req</Text>
    <Frame name="Pin in http" x={-5} y={95} w={10} h={10} bg="#4F8EF7" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin out http" x={135} y={55} w={10} h={10} bg="#4F8EF7" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin out auth" x={135} y={85} w={10} h={10} bg="#F87171" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin out session" x={135} y={105} w={10} h={10} bg="#F5A524" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node keycloak" x={1040} y={104} w={150} h={120} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={150} h={24} bg="#BE123C" rounded={8} />
    <Frame name="Header square" y={16} w={150} h={8} bg="#BE123C" />
    <Text name="Title" x={10} y={5} color="#FFE4E6" size={12} weight="bold" lineHeight={14}>keycloak</Text>
    <Text name="Sub" x={10} y={28} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>realm BricoMission</Text>
    <Frame name="Stat CPU" x={8} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>2%</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={3} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={78} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>620 MB</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={14} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Gpu note" x={10} y={92} color="#7E8DA6" size={10} font="JetBrains Mono" lineHeight={13}>VRAM, GPU: n/a</Text>
    <Frame name="Pin in auth" x={-5} y={33} w={10} h={10} bg="#F87171" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin in auth 2" x={-5} y={45} w={10} h={10} bg="#F87171" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin out mail" x={145} y={55} w={10} h={10} bg="#4ADE80" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node mailpit" x={1202} y={104} w={150} h={120} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={150} h={24} bg="#BE123C" rounded={8} />
    <Frame name="Header square" y={16} w={150} h={8} bg="#BE123C" />
    <Text name="Title" x={10} y={5} color="#FFE4E6" size={12} weight="bold" lineHeight={14}>mailpit</Text>
    <Text name="Sub" x={10} y={28} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>email code inbox</Text>
    <Frame name="Stat CPU" x={8} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0%</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Frame name="Stat RAM" x={78} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>20 MB</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={2} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Gpu note" x={10} y={92} color="#7E8DA6" size={10} font="JetBrains Mono" lineHeight={13}>VRAM, GPU: n/a</Text>
    <Frame name="Pin in mail" x={-5} y={55} w={10} h={10} bg="#4ADE80" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node minio" x={1040} y={748} w={150} h={120} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={150} h={24} bg="#B45309" rounded={8} />
    <Frame name="Header square" y={16} w={150} h={8} bg="#B45309" />
    <Text name="Title" x={10} y={5} color="#FEF3C7" size={12} weight="bold" lineHeight={14}>minio</Text>
    <Text name="Sub" x={10} y={28} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>S3 bucket media</Text>
    <Frame name="Stat CPU" x={8} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>0%</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999} />
    </Frame>
    <Frame name="Stat RAM" x={78} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>90 MB</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={5} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Gpu note" x={10} y={92} color="#7E8DA6" size={10} font="JetBrains Mono" lineHeight={13}>VRAM, GPU: n/a</Text>
    <Frame name="Pin in object" x={-5} y={45} w={10} h={10} bg="#FB923C" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
  <Frame name="Node postgres" x={1040} y={884} w={150} h={120} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Frame name="Header" w={150} h={24} bg="#B45309" rounded={8} />
    <Frame name="Header square" y={16} w={150} h={8} bg="#B45309" />
    <Text name="Title" x={10} y={5} color="#FEF3C7" size={12} weight="bold" lineHeight={14}>postgres</Text>
    <Text name="Sub" x={10} y={28} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>PG 17 + pgvector</Text>
    <Frame name="Stat CPU" x={8} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>CPU</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>1%</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={3} h={3} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Stat RAM" x={78} y={46} w={64} h={34}>
      <Text name="L" color="#8A9BB5" size={9} weight={600} lineHeight={11}>RAM</Text>
      <Text name="V" y={11} color="#E6EDF7" size={12} font="JetBrains Mono" weight="bold" lineHeight={15}>140 MB</Text>
      <Frame name="Track" y={29} w={58} h={3} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={8} h={3} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Gpu note" x={10} y={92} color="#7E8DA6" size={10} font="JetBrains Mono" lineHeight={13}>VRAM, GPU: n/a</Text>
    <Frame name="Pin in sql session" x={-5} y={25} w={10} h={10} bg="#F5A524" stroke="#0B1220" strokeWidth={2} rounded={999} />
    <Frame name="Pin in sql" x={-5} y={55} w={10} h={10} bg="#F5A524" stroke="#0B1220" strokeWidth={2} rounded={999} />
  </Frame>
</Frame>