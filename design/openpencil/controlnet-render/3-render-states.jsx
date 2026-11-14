<Frame name="3 · Render states (normative annotations)" x={860} flex="col" w={440} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Render states. Polling every 2 s while queued/running; alerts use the Capture alert component above the title.</Text>
  <Text name="Label queued" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>queued · same as frame 1, status card text below (position from the API; omitted when unknown)</Text>
  <Frame name="Status card queued" flex="col" w={240} gap={12} items="center" p={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={16}>
    <Icon name="lucide:hourglass" size={24} color="#2968EC" />
    <Text name="Status" w="fill" color="#182231" size={16} weight={600} textAlign="center" lineHeight={24}>Waiting for the GPU</Text>
    <Text name="Position" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>1 job ahead of yours</Text>
  </Frame>
  <Text name="Label failed" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>failed / interrupted · danger alert above the title; slider area shows the before photo without overlay; primary CTA becomes "Try again" (same photo, new seed)</Text>
  <Frame name="Alert failed" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={12}>
    <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
    <Text name="Text" grow={1} color="#182231" lineHeight={20}>We couldn't create this render. Try again in a moment.</Text>
  </Frame>
  <Text name="Copy interrupted" w="fill" color="#6B6B70" size={12} lineHeight={16}>interrupted (API restarted): "This render was interrupted. Try again." · GPU queue full (429): warning "The designer is busy right now. Try again in a minute." (no render created)</Text>
  <Text name="Label limit" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>limit reached (10 non-failed) · Generate again disabled, hint in the bottom bar</Text>
  <Frame name="Bar limit" flex="col" w="fill" gap={12} pt={12} pr={16} pb={16} pl={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
    <Text name="Hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>You've created 10 renders, the maximum for this project.</Text>
    <Frame name="Generate again – disabled" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Generate again</Text>
    </Frame>
  </Frame>
  <Text name="Label uploads-only" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>moodboard has only your photos · info alert (primary stroke, lucide:info) above the title</Text>
  <Frame name="Alert info uploads-only" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={12}>
    <Icon name="lucide:info" size={20} color="#2968EC" />
    <Text name="Text" grow={1} color="#182231" lineHeight={20}>Your own photos can't guide the style yet, so we used a neutral modern style.</Text>
  </Frame>
  <Text name="Copy offline" w="fill" color="#6B6B70" size={12} lineHeight={16}>offline: warning alert "You're offline. Your renders are safe; reconnect to see new ones." · CTAs and photo picker disabled · polling pauses and resumes when online. Not found / not owner: as the owned page ("We couldn't find this kitchen project"). Signed out: "Sign in to see this kitchen project".</Text>
</Frame>