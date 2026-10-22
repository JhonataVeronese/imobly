export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 422,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super("not_found", `${entity} não encontrado`, 404);
  }
}
