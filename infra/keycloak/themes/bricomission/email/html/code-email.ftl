<#--
  Code email, HTML part (design "Code Email (HTML 600 wide + plain text)").
  Overrides the keycloak-2fa-email-authenticator template of the same name. Provider data: code,
  ttl (seconds); Keycloak adds user (first name for the greeting). Inline styles with DESIGN.md
  token colors only, Inter with a system-font fallback, no remote images or fonts.
-->
<#assign bmTtl = ttl?is_number?then(ttl, (ttl!'300')?number)>
<#assign bmMinutes = (bmTtl / 60)?ceiling>
<#assign bmFont = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
<!DOCTYPE html>
<html lang="${locale.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${msg("brandName")}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAF8;">
  <tr>
    <td align="center" style="padding:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:552px;background-color:#FFFFFF;border:1px solid #E2E0DA;border-radius:20px;">
        <tr>
          <td style="padding:32px;font-family:${bmFont};color:#1C1C1E;">
            <p style="margin:0 0 24px 0;font-size:22px;line-height:28px;font-weight:700;color:#1F4E79;">${msg("brandName")}</p>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:24px;color:#1C1C1E;"><#if (user.firstName)?has_content>${msg("bmEmailGreeting", user.firstName)}<#else>${msg("bmEmailGreetingNoName")}</#if></p>
            <p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#1C1C1E;">${msg("bmEmailIntro")}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F1ED;border-radius:12px;">
              <tr>
                <td align="center" height="72" style="height:72px;font-family:${bmFont};font-size:34px;line-height:40px;font-weight:700;letter-spacing:10px;color:#1F4E79;">${code}</td>
              </tr>
            </table>
            <p style="margin:24px 0 24px 0;font-size:14px;line-height:20px;color:#6B6B70;">${msg("bmEmailValidity", bmMinutes)}</p>
            <div style="height:1px;line-height:1px;font-size:1px;background-color:#E2E0DA;">&nbsp;</div>
            <p style="margin:24px 0 0 0;font-size:14px;line-height:20px;color:#6B6B70;">${msg("bmEmailIgnore")}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
