<Frame name="ST1 · Header status chips and setup states (annotation text is normative)" flex="col" w={1200} gap={28} p={32} bg="#0B1220">
  <Text name="Title 1" color="#8A9BB5" size={11} weight="bold" lineHeight={14}>1 · HEADER STATUS CHIP (right side of the header, always visible)</Text>
  <Frame name="Chips" flex="row" w="fill" gap={16} wrap rowGap={16}>
    <Frame name="LIVE" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#0F2A1E" stroke="#1F6B45" rounded={999}>
        <Frame name="Dot" w={8} h={8} bg="#4ADE80" rounded={999} shadow="0 0 6 #4ADE80" />
        <Text name="T" color="#86EFAC" size={12} weight="bold" lineHeight={16}>LIVE</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>API stream and metrics agent connected; events arrive in real time.</Text>
    </Frame>
    <Frame name="RECONNECTING" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#2A2508" stroke="#7A5C1A" rounded={999}>
        <Icon name="lucide:loader" size={14} color="#FACC15" />
        <Text name="T" color="#FDE68A" size={12} weight="bold" lineHeight={16}>RECONNECTING</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>The stream dropped; retries with back-off and resumes from the last event id. The graph dims, the log keeps its lines.</Text>
    </Frame>
    <Frame name="API DISABLED" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#1E293B" stroke="#475569" rounded={999}>
        <Icon name="lucide:power-off" size={14} color="#94A3B8" />
        <Text name="T" color="#CBD5E1" size={12} weight="bold" lineHeight={16}>API DISABLED</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>The API runs without DIAGNOSTICS_ENABLED. Setup card shows the exact command.</Text>
    </Frame>
    <Frame name="NO AGENT" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#1E293B" stroke="#475569" rounded={999}>
        <Icon name="lucide:gauge" size={14} color="#94A3B8" />
        <Text name="T" color="#CBD5E1" size={12} weight="bold" lineHeight={16}>NO AGENT</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>Events flow but the metrics agent is down: widgets show a dash and the NO AGENT tag.</Text>
    </Frame>
    <Frame name="REPLAY" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#1E1740" stroke="#4C1D95" rounded={999}>
        <Icon name="lucide:rotate-ccw" size={14} color="#C4B5FD" />
        <Text name="T" color="#DDD6FE" size={12} weight="bold" lineHeight={16}>REPLAY</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>Plays a recorded run of the fake adapters (source=replay). Edges are dashed; safe to rehearse without GPU.</Text>
    </Frame>
    <Frame name="TOKEN MISMATCH" flex="col" w={260} gap={8}>
      <Frame name="Chip" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#2A1017" stroke="#7F1D1D" rounded={999}>
        <Icon name="lucide:key-round" size={14} color="#FCA5A5" />
        <Text name="T" color="#FECACA" size={12} weight="bold" lineHeight={16}>TOKEN MISMATCH</Text>
      </Frame>
      <Text name="D" w="fill" color="#8A9BB5" size={11} lineHeight={15}>The API rejected the shared token (401). Setup card explains DIAGNOSTICS_TOKEN.</Text>
    </Frame>
  </Frame>
  <Text name="Title 2" color="#8A9BB5" size={11} weight="bold" lineHeight={14}>2 · SETUP AND CONNECTION CARDS (centered over the dimmed graph; the log shows its own empty copy)</Text>
  <Frame name="Cards" flex="row" w="fill" gap={20}>
    <Frame name="Card disconnected" flex="col" w={360} gap={10} p={20} bg="#0E1626" stroke="#2A3A55" rounded={14} shadow="0 12 32 #00000080">
      <Frame name="Icon" flex="row" w={40} h={40} justify="center" items="center" bg="#2A2508" rounded={999}>
        <Icon name="lucide:wifi-off" size={20} color="#FACC15" />
      </Frame>
      <Text name="Title" color="#E6EDF7" size={16} weight="bold" lineHeight={22}>Connection lost</Text>
      <Text name="Body" w="fill" color="#8A9BB5" size={12} lineHeight={18}>The dashboard lost the event stream. Retrying in 4 s. Last event 14:02:45. The graph shows the last known state until the stream returns.</Text>
      <Frame name="Retry" flex="row" h={36} gap={6} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Icon name="lucide:refresh-cw" size={14} color="#FFFFFF" />
        <Text name="T" color="#FFFFFF" size={13} weight={600} lineHeight={18}>Retry now</Text>
      </Frame>
    </Frame>
    <Frame name="Card API disabled" flex="col" w={360} gap={10} p={20} bg="#0E1626" stroke="#2A3A55" rounded={14} shadow="0 12 32 #00000080">
      <Frame name="Icon" flex="row" w={40} h={40} justify="center" items="center" bg="#1E293B" rounded={999}>
        <Icon name="lucide:power-off" size={20} color="#94A3B8" />
      </Frame>
      <Text name="Title" color="#E6EDF7" size={16} weight="bold" lineHeight={22}>Diagnostics are off in the API</Text>
      <Text name="Body" w="fill" color="#8A9BB5" size={12} lineHeight={18}>Start the demo with the diagnostics profile so the API emits events:</Text>
      <Frame name="Command" flex="row" w="fill" p={10} bg="#0A1020" stroke="#1C2A44" rounded={8}>
        <Text name="T" grow={1} color="#CBD5E1" size={11} font="JetBrains Mono" lineHeight={16}>./launch-demo.sh</Text>
      </Frame>
    </Frame>
    <Frame name="Card token mismatch" flex="col" w={360} gap={10} p={20} bg="#0E1626" stroke="#7F1D1D" rounded={14} shadow="0 12 32 #00000080">
      <Frame name="Icon" flex="row" w={40} h={40} justify="center" items="center" bg="#2A1017" rounded={999}>
        <Icon name="lucide:key-round" size={20} color="#FCA5A5" />
      </Frame>
      <Text name="Title" color="#E6EDF7" size={16} weight="bold" lineHeight={22}>The API rejected the token</Text>
      <Text name="Body" w="fill" color="#8A9BB5" size={12} lineHeight={18}>DIAGNOSTICS_TOKEN differs between the API and the dashboard. Restart both from the same environment.</Text>
    </Frame>
  </Frame>
</Frame>