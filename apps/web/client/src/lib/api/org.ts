import type { AxiosInstance } from 'axios'

import type { OrganizationRow, OrgMemberRow, Page } from '@repo/shared'

/**
 * The organisation this session is acting for.
 *
 * `/org`, singular and with no id in the path: which organisation a request is
 * for is settled by the `active_org` cookie and re-checked against the
 * caller's memberships every request, so an id here would be a second answer
 * to a question already answered — see the API's own controller.
 */
export async function fetchOrganization(
  api: AxiosInstance,
): Promise<OrganizationRow> {
  const { data } = await api.get<OrganizationRow>('/org')

  return data
}

/**
 * Everyone in it, deactivated colleagues included.
 *
 * No paging: an organisation at this company's size is a hundred rows, the
 * endpoint answers `wholeList()`, and a members screen that hid people behind
 * a Load more would hide the one person somebody came to find.
 */
export async function fetchOrgMembers(
  api: AxiosInstance,
): Promise<OrgMemberRow[]> {
  const { data } = await api.get<Page<OrgMemberRow>>('/org/members')

  return data.data
}
