# Merkle Distributor

## Instructions of the exercise

Create a merkle distributor contract users can interact with to claim their tokens” (with a variable rate per user; user 1 needs to claim 5000 tokens, user 2 needs to claim 10000, user 3 needs to claim 100 tokens).

## Explanation of the project

The idea behind this project is that the smart contract does not need to store the instructions of who is owns the tokens because it can receive a claim order and easily verify whether it is valid or not. All the initial ERC20 tokens are within the balance of the smart contract, and it is this smart contract that transfers the tokens when the actual owners claim their tokens. Using the merkle tree logic, an external application can create the merkle tree with these transfer instructions and send the merkle root to the smart contract. The hash used in the leaf nodes is done using a combination of the node's index, the amount to claim and the address of the owner who will claim the tokens after. It is not possible to claim tokens that were not indicated when the merkle tree was created because any small change in the 3 fields used to generate the hash will produce a completely different hash and that hash will not match with the original merkle root, so the transfer will not occur. With this approach, the application that creates the tokens has to know in advance what all the owners are going to be and their allowed amount of tokens, because once the Merkle root is generated it cannot be modified.

This concept has been used in different projects like Uniswap, a music streaming called Audius, and others which they wanted the users to claim the tokens.

When searching for information about this, I came across a project where I took a big portion of the logic used in this project. It seems to be a standard way of doing. [See Uniswap Project](https://github.com/Uniswap/merkle-distributor).
However, I had to make some changes to make it work correctly and adapt it to what the exercise requires.

## Instructions to run the tests

The following assumes the use of `node@>=10`.

1. Clone this repository to your computer: `git clone git@github.com:hanzel98/merkle-distributor.git`

2. Go inside the project root and run `npm install` to install all the depedencies.

3. Compile the smart contracts by running `npm run compile`

4. Run the tests `npm run test`

## Tests video demo

[Watch video](https://youtu.be/C2iR4zkK8Oc).
