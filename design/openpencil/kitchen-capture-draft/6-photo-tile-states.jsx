<Frame name="6 · Photo tile states (2 flexible columns, 4:3, radius 20)" x={500} y={1110} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w={372} color="#182231" size={16} weight={600} lineHeight={24}>Photo tile states. No local preview (HEIC cannot be previewed): neutral placeholder until the server thumbnail arrives.</Text>
  <Frame name="Row uploading" flex="row" w="fill" gap={16}>
    <Frame name="Tile uploading (role=progressbar, 62%)" flex="col" h={128} w={171} gap={8} justify="center" items="center" py={0} px={16} bg="#F2F1ED" rounded={20}>
      <Text name="Text" color="#182231" weight={600} lineHeight={20}>Uploading… 62%</Text>
      <Frame name="Progress track" flex="row" h={6} w="fill" bg="#E2E0DA" rounded={999}>
        <Frame name="Progress value" w={86} h={6} bg="#2968EC" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Tile processing (after 100%)" flex="col" h={128} w={171} gap={8} justify="center" items="center" py={0} px={16} bg="#F2F1ED" rounded={20}>
      <Icon name="lucide:loader" size={20} color="#2968EC" />
      <Text name="Text" color="#182231" weight={600} lineHeight={20}>Processing…</Text>
    </Frame>
  </Frame>
  <Frame name="Row queued" flex="row" w="fill" gap={16}>
    <Frame name="Tile queued" flex="col" h={128} w={171} gap={8} justify="center" items="center" py={0} px={16} bg="#F2F1ED" rounded={20}>
      <Text name="Text" color="#6B6B70" lineHeight={20}>Waiting…</Text>
    </Frame>
    <Frame name="AddPhotoTile – disabled (limit reached)" flex="col" h={128} w={171} gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={20}>
      <Icon name="lucide:image-plus" size={24} color="#6B6B70" />
      <Text name="Text" color="#6B6B70" weight={600} lineHeight={20}>Add photos</Text>
    </Frame>
  </Frame>
  <Text name="Text" w={372} color="#6B6B70" lineHeight={20}>Limit reached message (below the grid): "You've added 8 photos, the maximum. Remove one to add another."</Text>
  <Frame name="Row errors" flex="row" w="fill" gap={16}>
    <Frame name="Tile error – failed (Retry + Remove); non-retryable errors show only Remove" flex="col" h={128} w={171} gap={8} justify="center" items="center" p={8} bg="#FFFFFF" stroke="#C0392B" strokeWidth={2} rounded={20}>
      <Frame name="Frame" flex="row" w="fill" gap={6}>
        <Icon name="lucide:circle-alert" size={16} color="#C0392B" />
        <Text name="Text" grow={1} color="#C0392B" size={12} weight={600} lineHeight={16}>We couldn't upload this photo.</Text>
      </Frame>
      <Frame name="Tile actions" flex="row" w="fill" gap={4} justify="center">
        <Frame name="Retry (44)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:refresh-cw" size={18} color="#2968EC" />
        </Frame>
        <Frame name="Remove (44)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:trash-2" size={18} color="#182231" />
        </Frame>
      </Frame>
    </Frame>
    <Frame name="Error copy per reason" flex="col" w={171} gap={6}>
      <Text name="Text" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>Tile error texts (Retry only where it can help):</Text>
      <Text name="Text" w="fill" color="#182231" size={12} lineHeight={16}>too large: "This photo is larger than 15 MB." (Remove)</Text>
      <Text name="Text" w="fill" color="#182231" size={12} lineHeight={16}>unsupported: "Use JPG, PNG, WebP or HEIC." (Remove)</Text>
      <Text name="Text" w="fill" color="#182231" size={12} lineHeight={16}>too small: "This photo is too small. Use one at least 480 px wide." (Remove)</Text>
      <Text name="Text" w="fill" color="#182231" size={12} lineHeight={16}>failed / storage unavailable: "We couldn't upload this photo." (Retry + Remove)</Text>
    </Frame>
  </Frame>
</Frame>