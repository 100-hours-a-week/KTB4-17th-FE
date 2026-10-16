export async function executeUserWithdrawal({
  withdrawUser,
  clearSession,
  resetAppState,
  navigateToLogin,
  notifySuccess,
  notifyFailure,
}) {
  try {
    await withdrawUser();
    clearSession();
    resetAppState();
    navigateToLogin();
    notifySuccess();
    return true;
  } catch (error) {
    notifyFailure(error);
    return false;
  }
}
