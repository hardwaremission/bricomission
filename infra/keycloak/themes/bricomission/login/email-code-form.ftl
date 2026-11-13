<#import "template.ftl" as layout>
<#--
  Email code (design frame "Email code" and its states). Overrides the template of the
  keycloak-2fa-email-authenticator provider (same name, form id, field and submit names:
  emailCode, login, resend, cancel). Provider attributes used: codeLength, maskedEmail
  (authenticator config showMaskedEmailOnOtpForm=true), maxAttemptsReached.
  States: wrong code (error alert + danger input), code expired (warning alert, Resend primary,
  Verify hidden), too many attempts (error alert, input and Verify disabled/hidden, Resend
  primary), resend cooldown (provider info message).
  The provider does not pass the code TTL to this page: the hint uses 5 minutes, matching
  ttl=300 of authenticator config email-otp-6-digits in the realm JSON (keep them in sync).
-->
<#assign bmLength = (codeLength!6)>
<#assign bmMaxReached = (maxAttemptsReached?? && maxAttemptsReached)>
<#assign bmExpired = (message?has_content && message.summary == msg("expiredActionTokenSessionExistsMessage"))>
<#-- The provider reports the resend cooldown as a global error; the design shows it as info. -->
<#assign bmCooldown = (message?has_content && resendAvailableInSeconds?? && message.summary == msg("email-authenticator-resend-cooldown", resendAvailableInSeconds))>
<#assign bmResendPrimary = bmMaxReached || bmExpired>
<#assign bmCodeError = messagesPerField.existsError('emailCode') && !bmExpired && !bmMaxReached>
<@layout.registrationLayout displayMessage=true badge="mail" alertType=bmExpired?then("warning", bmCooldown?then("info", "")); section>
    <#if section = "header">
        ${msg("bmCodeTitle")}
    <#elseif section = "helper">
        <p class="bm-helper">${msg("bmCodeHelper", bmLength, (maskedEmail!''))}</p>
    <#elseif section = "form">
        <form id="kc-otp-login-form" class="bm-form" action="${url.loginAction}" method="post" novalidate>
            <div class="bm-field">
                <label for="emailCode" class="bm-label">${msg("bmCodeLabel")}</label>
                <div class="bm-input-row bm-input-row--code<#if bmCodeError> bm-input-row--error</#if>">
                    <input id="emailCode" name="emailCode" class="bm-input bm-input--code" type="text"
                           inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="${bmLength}"
                           <#if !bmMaxReached && !bmExpired>autofocus</#if>
                           <#if bmMaxReached>disabled</#if>
                           aria-invalid="<#if bmCodeError>true<#else>false</#if>" aria-describedby="<#if message?has_content>bm-alert </#if>bm-code-hint"/>
                </div>
                <p id="bm-code-hint" class="bm-hint">${msg("bmCodeValidity", 5)}</p>
            </div>
            <#if !bmResendPrimary>
                <button class="bm-button bm-button--primary" name="login" id="kc-login" type="submit" value="login">${msg("bmVerify")}</button>
            </#if>
            <button class="bm-button <#if bmResendPrimary>bm-button--primary<#else>bm-button--secondary</#if>" name="resend" id="kc-resend" type="submit" value="resend">${msg("resendCode")}</button>
            <div class="bm-links">
                <button class="bm-link" name="cancel" id="kc-cancel" type="submit" value="cancel">${msg("bmCancelCode")}</button>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
