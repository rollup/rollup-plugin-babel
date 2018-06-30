function classDecorator(target) {
    target.isDecorated = true;
}

@classDecorator
export default class MyClass {};
