class ApiException implements Exception {
  ApiException(this.code, this.message, this.data);
  final String code;
  final String message;
  final dynamic data;
  bool get isUnauthorized => code == 'UNAUTHORIZED';
  bool get isValidation => code == 'VALIDATION';
  @override
  String toString() => 'ApiException($code): $message';
}