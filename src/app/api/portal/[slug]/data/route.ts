import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, settings, access } = await requirePortalAccess(slug);
    const now = new Date().toISOString();
    const busyEnd = new Date();
    busyEnd.setDate(
      busyEnd.getDate() + Number(settings.booking_advance_days || 90)
    );

    const [
      account,
      contact,
      appointments,
      anamnesisForms,
      services,
      professionals,
      busy,
      blocks,
      vouchers,
      packs,
      wallet,
      sales,
      paymentLinks,
      invoiceRequests,
      referralProgram,
      referralCode,
      referrals,
      communicationSettings,
      privacySettings,
      privacyNotice,
    ] = await Promise.all([
      admin
        .from('accounts')
        .select('name,logo_url,default_currency,timezone,public_url')
        .eq('id', access.account_id)
        .single(),
      admin
        .from('contacts')
        .select(
          'id,name,email,phone,company,avatar_url,client_reference,birth_date,tax_id,gender,address_line,postal_code,city,country,source,preferred_contact,marketing_consent,marketing_whatsapp_consent,whatsapp_consent,privacy_review_status,consent_reviewed_at,consent_review_source,created_at,updated_at'
        )
        .eq('id', access.contact_id)
        .single(),
      admin
        .from('clinic_appointments')
        .select(
          'id,scheduled_start,scheduled_end,status,source,price,currency,confirmation_status,paid_at,reschedule_count,notes,service:clinic_services(id,name,duration_minutes),professional:profiles!clinic_appointments_professional_profile_id_fkey(id,full_name,professional_title),benefits:finance_appointment_benefits(id,benefit_type,status,reserved_amount,reserved_sessions,voucher_id,client_pack_id)'
        )
        .eq('contact_id', access.contact_id)
        .order('scheduled_start', { ascending: false })
        .limit(150),
      admin
        .from('clinic_anamnesis_forms')
        .select(
          'id,status,public_token,selected_modalities,answers,signature_name,submitted_at,reviewed_at,created_at,service:clinic_services(name,category),appointment:clinic_appointments!clinic_anamnesis_forms_appointment_id_fkey(scheduled_start)'
        )
        .eq('account_id', access.account_id)
        .eq('contact_id', access.contact_id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('clinic_services')
        .select('id,name,description,duration_minutes,price,currency,color')
        .eq('account_id', access.account_id)
        .eq('is_active', true)
        .eq('internal_booking_enabled', true)
        .order('name'),
      admin
        .from('profiles')
        .select(
          'id,full_name,professional_title,professional_bio,professional_color,working_hours'
        )
        .eq('account_id', access.account_id)
        .eq('is_professional', true)
        .eq('professional_show_online', true)
        .eq('online_booking_blocked', false)
        .order('full_name'),
      admin
        .from('clinic_appointments')
        .select('professional_profile_id,scheduled_start,scheduled_end,status')
        .eq('account_id', access.account_id)
        .gte('scheduled_start', now)
        .lte('scheduled_start', busyEnd.toISOString())
        .limit(5000),
      admin
        .from('clinic_time_blocks')
        .select('professional_profile_id,starts_at,ends_at')
        .eq('account_id', access.account_id)
        .gte('ends_at', now)
        .lte('starts_at', busyEnd.toISOString())
        .limit(5000),
      settings.benefits_enabled
        ? admin
            .from('finance_vouchers')
            .select(
              'id,code,pin_code,voucher_type,initial_balance,current_balance,currency,status,remaining_uses,expires_at,created_at,service:clinic_services(id,name)'
            )
            .eq('owner_contact_id', access.contact_id)
            .in('status', ['active', 'used', 'expired', 'cancelled'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      settings.benefits_enabled
        ? admin
            .from('finance_client_packs')
            .select(
              'id,code,pin_code,status,purchased_at,expires_at,pack:finance_pack_catalog(id,name),balances:finance_client_pack_balances(id,total_sessions,used_sessions,remaining_sessions,service:clinic_services(id,name))'
            )
            .eq('contact_id', access.contact_id)
            .order('purchased_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      settings.financial_enabled || settings.benefits_enabled
        ? admin
            .from('finance_client_wallets')
            .select('id,currency,balance,created_at,updated_at')
            .eq('contact_id', access.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      settings.financial_enabled
        ? admin
            .from('finance_sales')
            .select(
              'id,sale_number,status,currency,subtotal,discount_amount,tax_amount,total_amount,paid_amount,balance_due,completed_at,created_at,items:finance_sale_items(id,item_type,name_snapshot,quantity,unit_price,discount_amount,tax_rate,tax_amount,line_total),payments:finance_payments(id,method,status,amount,reference_code,paid_at)'
            )
            .eq('contact_id', access.contact_id)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      settings.financial_enabled
        ? admin
            .from('finance_payment_links')
            .select('id,sale_id,status,amount,currency,description,payment_url,provider,paid_at,created_at')
            .eq('account_id', access.account_id)
            .eq('contact_id', access.contact_id)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      settings.financial_enabled
        ? admin
            .from('finance_invoice_requests')
            .select('*')
            .eq('account_id', access.account_id)
            .eq('contact_id', access.contact_id)
            .order('requested_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      settings.referrals_enabled !== false
        ? admin
            .from('referral_program_settings')
            .select('*')
            .eq('account_id', access.account_id)
            .eq('enabled', true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      settings.referrals_enabled !== false
        ? admin
            .from('referral_codes')
            .select('id,code,is_active,created_at')
            .eq('account_id', access.account_id)
            .eq('contact_id', access.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      settings.referrals_enabled !== false
        ? admin
            .from('referrals')
            .select(
              'id,friend_contact_id,friend_name,friend_phone,friend_email,status,registered_at,contacted_at,scheduled_at,qualified_at,rewarded_at,rejected_at,rejection_reason,lost_at,lost_reason,created_at,rewards:referral_rewards(id,beneficiary_type,reward_type,reward_value,status,reward_code,expires_at,issued_at,redeemed_at,credited_amount,available_amount,reversed_amount),events:referral_events(id,action,reason,metadata,created_at)'
            )
            .eq('account_id', access.account_id)
            .eq('referrer_contact_id', access.contact_id)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from('clinic_communication_settings')
        .select('*')
        .eq('account_id', access.account_id)
        .maybeSingle(),
      admin
        .from('privacy_settings')
        .select('privacy_notice_version,privacy_policy_url,controller_name,controller_email')
        .eq('account_id', access.account_id)
        .maybeSingle(),
      admin
        .from('privacy_consent_events')
        .select('policy_version,occurred_at')
        .eq('account_id', access.account_id)
        .eq('contact_id', access.contact_id)
        .eq('purpose', 'privacy_notice')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const coreResults = [account, contact, appointments];
    const failed = coreResults.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const optionalResults = [
      anamnesisForms,
      services,
      professionals,
      busy,
      blocks,
      vouchers,
      packs,
      wallet,
      sales,
      paymentLinks,
      invoiceRequests,
      referralProgram,
      referralCode,
      referrals,
      communicationSettings,
      privacySettings,
      privacyNotice,
    ];
    for (const result of optionalResults) {
      if (result.error) {
        console.warn(
          '[client-portal] optional module unavailable:',
          result.error
        );
      }
    }

    let effectiveReferralCode = referralCode;
    if (
      referralProgram.data &&
      referralCode.data &&
      !databaseBoolean(referralCode.data.is_active)
    ) {
      const reactivatedCode = await admin
        .from('referral_codes')
        .update({ is_active: true })
        .eq('id', referralCode.data.id)
        .select('id,code,is_active,created_at')
        .maybeSingle();
      if (!reactivatedCode.error) effectiveReferralCode = reactivatedCode;
    } else if (referralProgram.data && !referralCode.data) {
      const generatedCode = `REF-${access.contact_id
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 12)
        .toUpperCase()}`;
      const createdCode = await admin
        .from('referral_codes')
        .upsert(
          {
            account_id: access.account_id,
            contact_id: access.contact_id,
            code: generatedCode,
            is_active: true,
          },
          { onConflict: 'account_id,contact_id' }
        )
        .select('id,code,is_active,created_at')
        .maybeSingle();
      if (createdCode.error) {
        console.warn(
          '[client-portal] referral code could not be created:',
          createdCode.error
        );
      } else {
        effectiveReferralCode = createdCode;
      }
    }

    const voucherIds = (vouchers.data ?? []).map((item) => item.id);
    const packIds = (packs.data ?? []).map((item) => item.id);
    const benefitFilter = [
      voucherIds.length ? `voucher_id.in.(${voucherIds.join(',')})` : '',
      packIds.length ? `client_pack_id.in.(${packIds.join(',')})` : '',
    ]
      .filter(Boolean)
      .join(',');
    const [benefitLogs, walletTransactions, campaigns, campaignEnrollments] =
      await Promise.all([
        benefitFilter
          ? admin
              .from('finance_benefit_logs')
              .select(
                'id,voucher_id,client_pack_id,appointment_id,action,amount,sessions,performed_by_name,approved_by_name,notes,metadata,created_at'
              )
              .eq('account_id', access.account_id)
              .or(benefitFilter)
              .order('created_at', { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [], error: null }),
        wallet.data
          ? admin
              .from('finance_wallet_transactions')
              .select(
                'id,transaction_type,amount,balance_after,referral_reward_id,sale_id,description,metadata,created_at'
              )
              .eq('wallet_id', wallet.data.id)
              .order('created_at', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from('portal_campaigns')
          .select('*,enrollments:portal_campaign_enrollments(count)')
          .eq('account_id', access.account_id)
          .eq('status', 'published')
          .lte('starts_at', now)
          .or(`ends_at.is.null,ends_at.gte.${now}`)
          .order('starts_at', { ascending: false }),
        admin
          .from('portal_campaign_enrollments')
          .select('campaign_id,status,joined_at,sale_id')
          .eq('account_id', access.account_id)
          .eq('contact_id', access.contact_id),
      ]);
    const secondaryResults = [
      benefitLogs,
      walletTransactions,
      campaigns,
      campaignEnrollments,
    ];
    for (const result of secondaryResults) {
      if (result.error) {
        console.warn(
          '[client-portal] secondary module unavailable:',
          result.error
        );
      }
    }
    const campaignsUnavailable = Boolean(
      campaigns.error || campaignEnrollments.error
    );

    return Response.json({
      settings: {
        slug: settings.slug,
        welcomeTitle: settings.welcome_title,
        welcomeMessage: settings.welcome_message,
        bookingEnabled: settings.booking_enabled,
        benefitsEnabled: settings.benefits_enabled,
        financialEnabled: settings.financial_enabled,
        profileEditEnabled: settings.profile_edit_enabled !== false,
        requiresPasswordChange: databaseBoolean(
          access.requires_password_change
        ),
        referralsEnabled:
          settings.referrals_enabled !== false && Boolean(referralProgram.data),
        cancellationHours: settings.cancellation_hours,
        bookingAdvanceDays: settings.booking_advance_days,
        anamnesisPublicSlug: databaseBoolean(
          communicationSettings.data?.anamnesis_enabled
        )
          ? communicationSettings.data.anamnesis_public_slug
          : null,
      },
      business: account.data,
      client: contact.data,
      appointments: appointments.data ?? [],
      anamnesis: anamnesisForms.data ?? [],
      catalog: {
        services: services.data ?? [],
        professionals: professionals.data ?? [],
      },
      availability: {
        busy: (busy.data ?? []).filter(
          (item) => !['cancelled', 'canceled', 'no_show'].includes(item.status)
        ),
        blocks: blocks.data ?? [],
      },
      benefits: {
        vouchers: vouchers.data ?? [],
        packs: packs.data ?? [],
        wallet: wallet.data,
        logs: benefitLogs.data ?? [],
        walletTransactions: walletTransactions.data ?? [],
      },
      finance: {
        sales: sales.data ?? [],
        paymentLinks: paymentLinks.data ?? [],
        invoiceRequests: (invoiceRequests.data ?? []).map((item) => ({
          id: item.id,
          sale_id: item.sale_id,
          status: item.status,
          fiscal_name: item.fiscal_name,
          tax_id: item.tax_id,
          email: item.email,
          address_line: item.address_line,
          postal_code: item.postal_code,
          city: item.city,
          country: item.country,
          client_notes: item.client_notes,
          invoice_number: item.invoice_number,
          admin_notes: item.admin_notes,
          requested_at: item.requested_at,
          processing_at: item.processing_at,
          completed_at: item.completed_at,
          has_document: Boolean(item.invoice_document_path),
        })),
      },
      referrals: {
        program: referralProgram.data,
        code: effectiveReferralCode.data,
        items: referrals.data ?? [],
      },
      campaigns: (campaignsUnavailable ? [] : (campaigns.data ?? [])).map(
        (campaign) => ({
          ...campaign,
          enrollmentCount: Number(campaign.enrollments?.[0]?.count ?? 0),
          enrollment:
            (campaignEnrollments.data ?? []).find(
              (entry) => entry.campaign_id === campaign.id
            ) ?? null,
          enrollments: undefined,
        })
      ),
      privacy: {
        policyVersion: privacySettings.data?.privacy_notice_version || '1.0',
        policyUrl:
          privacySettings.data?.privacy_policy_url ||
          `/privacy/${encodeURIComponent(settings.slug)}`,
        controllerName:
          privacySettings.data?.controller_name || account.data?.name || null,
        controllerEmail: privacySettings.data?.controller_email || null,
        noticeAccepted:
          privacyNotice.data?.policy_version ===
          (privacySettings.data?.privacy_notice_version || '1.0'),
      },
    });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

function databaseBoolean(value: unknown) {
  return value === true || value === 1 || value === '1';
}
