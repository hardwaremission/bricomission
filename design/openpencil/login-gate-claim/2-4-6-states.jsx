<Frame name="2 / 4 / 6 · States (normative annotations)" x={1290} flex="col" w={440} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Generate and owned-project states. Alerts use the Capture alert component above the title; sheets use the language/account sheet pattern.</Text>
  <Text name="Label 2" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>2 · not ready (Capture incomplete or empty moodboard) or no draft · both CTAs disabled (surfaceMuted, textMuted, aria-disabled); hint + link in the bottom bar above them</Text>
  <Frame name="Bar not ready" flex="col" w="fill" gap={8} pt={12} pr={16} pb={16} pl={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
    <Text name="Hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Your kitchen still needs a photo and all three measurements.</Text>
    <Frame name="Link 'Go to your kitchen' (44 tall)" flex="row" h={44} w="fill" gap={4} justify="center" items="center">
      <Icon name="lucide:arrow-left" size={16} color="#2968EC" />
      <Text name="Text" color="#2968EC" weight={600} lineHeight={20} textDecoration="underline">Go to your kitchen</Text>
    </Frame>
  </Frame>
  <Text name="Copy 2" w="fill" color="#6B6B70" size={12} lineHeight={16}>Other hints: empty moodboard "Add at least one kitchen or photo to your moodboard." + link "Go to your style"; no draft "Start your kitchen project first." + link "Start" (→ /kitchen-projects/new). Summary card shows "—" for missing parts.</Text>
  <Text name="Label 4" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>4 · claiming (after sign-in with intent, or a signed-in user pressing a CTA) · sheet content, no Close, aria-busy</Text>
  <Frame name="Sheet claiming" flex="col" w="fill" gap={12} items="center" p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
    <Icon name="lucide:loader" size={24} color="#2968EC" />
    <Text name="Text" w="fill" color="#182231" size={16} weight={600} textAlign="center" lineHeight={24}>Saving your kitchen to your account…</Text>
  </Frame>
  <Text name="Label 6" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>6 · error states</Text>
  <Frame name="Alert wrong role (warning)" flex="col" w="fill" gap={8} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={12}>
    <Frame name="Row" flex="row" w="fill" gap={12}>
      <Icon name="lucide:circle-alert" size={20} color="#B7791F" />
      <Text name="Text" grow={1} color="#182231" lineHeight={20}>This account can't save kitchen projects. Sign out and use a homeowner account.</Text>
    </Frame>
    <Frame name="Sign out (secondary, h 44)" flex="row" h={44} items="center" py={0} px={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Text name="Label" color="#2968EC" weight={600} lineHeight={20}>Sign out</Text>
    </Frame>
  </Frame>
  <Frame name="Alert claim failed / offline (danger)" flex="col" w="fill" gap={8} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={12}>
    <Frame name="Row" flex="row" w="fill" gap={12}>
      <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      <Text name="Text" grow={1} color="#182231" lineHeight={20}>We couldn't save your kitchen to your account. Your draft is safe; try again.</Text>
    </Frame>
    <Frame name="Retry (secondary, h 44)" flex="row" h={44} gap={6} items="center" py={0} px={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:refresh-cw" size={16} color="#2968EC" />
      <Text name="Label" color="#2968EC" weight={600} lineHeight={20}>Try again</Text>
    </Frame>
  </Frame>
  <Text name="Copy 6" w="fill" color="#6B6B70" size={12} lineHeight={16}>Offline: same danger alert with "You're offline. Your draft is safe; reconnect to save it to your account." and CTAs disabled. Draft expired: Capture's info alert "Your previous draft expired after 7 days without changes. Start again." + link Start. Owned page signed out: title "Sign in to see this kitchen project" + primary "Sign in" (returnTo this page). Not found / another account's project: title "We couldn't find this kitchen project" + link "Go to Home".</Text>
</Frame>