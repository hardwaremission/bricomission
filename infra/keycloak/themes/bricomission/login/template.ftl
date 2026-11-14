<#import "bm-icons.ftl" as icons>
<#import "bm-logo.ftl" as logo>
<#--
  BricoMission page shell (approved design: docs/design/keycloak-login-theme.md, "Shared Layout").
  Header with the SVG wordmark logo (bm-logo.ftl), then Content: Intro (optional badge, title, helper), the form-level
  Alert, and the page body. No language picker: the locale comes from ui_locales (developer decision 2026-11-13: no stored Keycloak locale, the app language always wins).
  Sections a page may provide: "header" (title), "helper", "form", "info", "socialProviders".
  Base templates this theme does not override use the same macro and simply leave out "helper".
-->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false badge="" badgeTone="" contentClass="" alertType="">
<#assign bmTitle><#nested "header"></#assign>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}" lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="color-scheme" content="light">
    <title>${bmTitle?markup_string?trim?no_esc} · ${msg("brandName")}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" sizes="16x16 32x32 48x48">
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet">
        </#list>
    </#if>
    <script src="${url.resourcesPath}/js/bricomission.js" defer></script>
</head>
<body class="${properties.kcBodyClass!} ${bodyClass}" data-page-id="login-${pageId}">
<div class="${properties.kcLoginClass!}">
    <header class="bm-header">
        <@logo.wordmark/>
    </header>
    <main class="bm-content ${contentClass}">
        <div class="bm-intro<#if badge?has_content> bm-intro--badge</#if>">
            <#if badge?has_content>
                <div class="bm-badge<#if badgeTone?has_content> bm-badge--${badgeTone}</#if>"><@icons.icon name=badge size=26/></div>
            </#if>
            <h1 id="kc-page-title" class="bm-title">${bmTitle?markup_string?trim?no_esc}</h1>
            <#nested "helper">
        </div>

        <#-- App-initiated actions should not see warning messages about the need to complete the action during login. -->
        <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
            <@alert type=alertType?has_content?then(alertType, message.type)>${kcSanitize(message.summary)?no_esc}</@alert>
        </#if>

        <#nested "form">

        <#nested "socialProviders">

        <#if displayInfo>
            <div id="kc-info" class="bm-links">
                <#nested "info">
            </div>
        </#if>
    </main>
</div>
</body>
</html>
</#macro>

<#-- Form-level Alert: error (danger, circle-alert), warning (warning, clock), info/success (primary, info). -->
<#macro alert type="error" id="bm-alert">
<#if type == "error">
    <#assign bmAlertTone="error" bmAlertIcon="circle-alert">
<#elseif type == "warning">
    <#assign bmAlertTone="warning" bmAlertIcon="clock">
<#else>
    <#assign bmAlertTone="info" bmAlertIcon="info">
</#if>
<div id="${id}" class="bm-alert bm-alert--${bmAlertTone}" role="alert" data-alert-type="${bmAlertTone}">
    <@icons.icon name=bmAlertIcon size=20/>
    <span class="bm-alert__text"><#nested></span>
</div>
</#macro>

<#-- Field error row: circle-alert 16 + text, linked to the input through aria-describedby. -->
<#macro fieldError id>
<div id="${id}" class="bm-field-error" aria-live="polite">
    <@icons.icon name="circle-alert" size=16/>
    <span><#nested></span>
</div>
</#macro>

<#-- Password show/hide toggle (44x44, eye 20). Behavior in resources/js/bricomission.js. -->
<#macro passwordToggle controls>
<button type="button" class="bm-toggle" data-password-toggle aria-controls="${controls}" aria-pressed="false"
        aria-label="${msg('showPassword')}" data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
    <@icons.icon name="eye" size=20 extraClass="bm-icon--show"/>
    <@icons.icon name="eye-off" size=20 extraClass="bm-icon--hide"/>
</button>
</#macro>

<#-- "Back to BricoMission" text link with arrow; only when the client has a base URL. -->
<#macro backLink>
<#if client?? && client.baseUrl?has_content>
    <a id="backToApplication" class="bm-link" href="${client.baseUrl}"><@icons.icon name="arrow-left" size=16/>${msg("bmBackToApp")}</a>
</#if>
</#macro>
