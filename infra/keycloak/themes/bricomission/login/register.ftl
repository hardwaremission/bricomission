<#import "template.ftl" as layout>
<#--
  Create account (design frame "Create account" and its field-error state).
  Fields in design order: first name, last name, email, username, password, confirm password.
  Any other user-profile attribute except locale is rendered after them as a plain text field (none today).
  Field errors are per field; non-field errors use the form-level Alert.
-->
<#assign bmAttrs = {}>
<#list profile.attributes as attribute>
    <#assign bmAttrs = bmAttrs + {attribute.name: attribute}>
</#list>
<#assign bmOrder = ["firstName", "lastName", "email", "username"]>
<#assign bmAutocomplete = {"firstName": "given-name", "lastName": "family-name", "email": "email", "username": "username"}>
<#assign bmLabelKey = {"firstName": "firstName", "lastName": "lastName", "email": "email", "username": "username"}>
<#-- User profile reports every empty required attribute with the generic error-user-attribute-required;
     the design names the field, so those errors are replaced by the per-field message. -->
<#assign bmRequiredKey = {"firstName": "missingFirstNameMessage", "lastName": "missingLastNameMessage", "email": "missingEmailMessage", "username": "missingUsernameMessage"}>

<#macro textField attribute>
    <#assign bmHasError = messagesPerField.existsError(attribute.name)>
    <div class="bm-field">
        <label for="${attribute.name}" class="bm-label"><#if bmLabelKey[attribute.name]??>${msg(bmLabelKey[attribute.name])}<#else>${advancedMsg(attribute.displayName!attribute.name)}</#if></label>
        <div class="bm-input-row<#if bmHasError> bm-input-row--error</#if>">
            <input id="${attribute.name}" name="${attribute.name}" class="bm-input"
                   type="<#if attribute.name == 'email'>email<#else>text</#if>"
                   value="${(attribute.value!'')}"
                   autocomplete="${bmAutocomplete[attribute.name]!(attribute.autocomplete!'on')}"
                   <#if attribute.name == 'email' || attribute.name == 'username'>autocapitalize="none" spellcheck="false" dir="ltr"</#if>
                   <#if attribute.readOnly>disabled</#if>
                   <#if attribute.required>aria-required="true"</#if>
                   aria-invalid="<#if bmHasError>true<#else>false</#if>"<#if bmHasError> aria-describedby="input-error-${attribute.name}"</#if>/>
        </div>
        <#if bmHasError>
            <#assign bmError = messagesPerField.get(attribute.name)>
            <#if bmRequiredKey[attribute.name]?? && bmError == msg("error-user-attribute-required")>
                <#assign bmError = msg(bmRequiredKey[attribute.name])>
            </#if>
            <@layout.fieldError id="input-error-${attribute.name}">${kcSanitize(bmError)?no_esc}</@layout.fieldError>
        </#if>
    </div>
</#macro>

<#macro passwordField name labelKey>
    <#assign bmHasError = messagesPerField.existsError(name)>
    <div class="bm-field">
        <label for="${name}" class="bm-label">${msg(labelKey)}</label>
        <div class="bm-input-row bm-input-row--password<#if bmHasError> bm-input-row--error</#if>" dir="ltr">
            <input id="${name}" name="${name}" class="bm-input" type="password" autocomplete="new-password" aria-required="true"
                   aria-invalid="<#if bmHasError>true<#else>false</#if>"<#if bmHasError> aria-describedby="input-error-${name}"</#if>/>
            <@layout.passwordToggle controls=name/>
        </div>
        <#if bmHasError>
            <@layout.fieldError id="input-error-${name}">${kcSanitize(messagesPerField.get(name))?no_esc}</@layout.fieldError>
        </#if>
    </div>
</#macro>

<@layout.registrationLayout displayMessage=messagesPerField.exists('global') contentClass="bm-content--register"; section>
    <#if section = "header">
        <#if messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${msg("registerTitle")}</#if>
    <#elseif section = "helper">
        <p class="bm-helper">${msg("bmRegisterHelper")}</p>
    <#elseif section = "form">
        <form id="kc-register-form" class="bm-form" action="${url.registrationAction}" method="post" novalidate>
            <#list bmOrder as name>
                <#if bmAttrs[name]??><@textField attribute=bmAttrs[name]/></#if>
            </#list>
            <#-- No hidden `locale` field (developer decision 2026-11-13): Keycloak never stores a
                 locale on new accounts, so ui_locales (the app language) decides every page and email. -->
            <#list profile.attributes as attribute>
                <#if !bmOrder?seq_contains(attribute.name) && attribute.name != 'locale'>
                    <@textField attribute=attribute/>
                </#if>
            </#list>
            <#if passwordRequired??>
                <@passwordField name="password" labelKey="password"/>
                <@passwordField name="password-confirm" labelKey="passwordConfirm"/>
            </#if>
            <button class="bm-button bm-button--primary" id="kc-register" type="submit">${msg("doRegister")}</button>
        </form>

        <div class="bm-links">
            <div class="bm-link-row">
                <span>${msg("bmAlreadyHaveAccount")}</span>
                <a class="bm-link" href="${url.loginUrl}">${msg("doLogIn")}</a>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
