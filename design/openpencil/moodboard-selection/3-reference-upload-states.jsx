<Frame name="3 · Reference upload states" x={880} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Your photos in the moodboard: same tile states and copy as the Capture photo tiles (no local preview; neutral placeholder until the server thumbnail arrives). They count towards the 12.</Text>
  <Frame name="Row 1" flex="row" w="fill" gap={16}>
    <Frame name="Tile uploading (role=progressbar)" flex="col" h={128} grow={1} gap={8} justify="center" py={0} px={16} bg="#F2F1ED" rounded={20}>
      <Text name="Label" color="#182231" weight={600} lineHeight={20}>Uploading… 62%</Text>
      <Frame name="Track" flex="row" h={6} w="fill" bg="#E2E0DA" rounded={999}>
        <Frame name="Value" w={70} h={6} bg="#2968EC" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Tile processing" flex="col" h={128} grow={1} gap={8} justify="center" items="center" bg="#F2F1ED" rounded={20}>
      <Icon name="lucide:loader" size={20} color="#2968EC" />
      <Text name="Label" color="#182231" weight={600} lineHeight={20}>Processing…</Text>
    </Frame>
  </Frame>
  <Frame name="Row 2" flex="row" w="fill" gap={16}>
    <Frame name="Tile error – failed (Retry + Remove)" flex="col" h={128} grow={1} justify="between" p={8} bg="#FFFFFF" stroke="#C0392B" strokeWidth={2} rounded={20}>
      <Frame name="Message" flex="row" w="fill" gap={6}>
        <Icon name="lucide:circle-alert" size={16} color="#C0392B" />
        <Text name="Text" grow={1} color="#C0392B" size={12} weight={600} lineHeight={16}>We couldn't upload this photo.</Text>
      </Frame>
      <Frame name="Actions" flex="row" gap={4}>
        <Frame name="Retry – 'Retry upload'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:refresh-cw" size={18} color="#2968EC" />
        </Frame>
        <Frame name="Remove – 'Remove photo'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:trash-2" size={18} color="#182231" />
        </Frame>
      </Frame>
    </Frame>
    <Frame name="Tile queued" flex="col" h={128} grow={1} justify="center" items="center" bg="#F2F1ED" rounded={20}>
      <Text name="Label" color="#6B6B70" lineHeight={20}>Waiting…</Text>
    </Frame>
  </Frame>
  <Text name="Errors" w="fill" color="#6B6B70" size={12} lineHeight={16}>Error copy as Capture: too large "This photo is larger than 15 MB." · unsupported "Use JPG, PNG, WebP or HEIC." · too small "This photo is too small. Use one at least 480 px wide." (Remove only) · failed / storage unavailable "We couldn't upload this photo." (Retry + Remove). Gallery picks keep working while storage is down.</Text>
</Frame>