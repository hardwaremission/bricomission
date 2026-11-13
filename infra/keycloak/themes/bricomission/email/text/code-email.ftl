<#ftl output_format="plainText">
<#-- Code email, plain-text part: same copy as the HTML part, code on its own line. -->
<#assign bmTtl = ttl?is_number?then(ttl, (ttl!'300')?number)>
<#assign bmMinutes = (bmTtl / 60)?ceiling>
${msg("brandName")}

<#if (user.firstName)?has_content>${msg("bmEmailGreeting", user.firstName)}<#else>${msg("bmEmailGreetingNoName")}</#if>

${msg("bmEmailIntro")}

${code}

${msg("bmEmailValidity", bmMinutes)}

${msg("bmEmailIgnore")}
