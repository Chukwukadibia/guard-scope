-- Forward fix for 20261117100000_client_approval: two internal helpers were left executable by API roles
-- (found by the developer pgTAP test 77). Internal helpers must never be callable through the Data API.
revoke execute on function public._throttle_key() from public, anon, authenticated;
revoke execute on function public._throttle_limits() from public, anon, authenticated;
