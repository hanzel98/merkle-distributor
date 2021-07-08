const chai =  require('chai');
const { expect } = chai;
const { solidity, MockProvider, deployContract } =  require('ethereum-waffle');
const { BigNumber, constants } =  require('ethers');
const BalanceTree =  require('../src/balance-tree');
const Distributor =  require('../build/MerkleDistributor.json');
const TestERC20 =  require('../build/TestERC20.json');
const parseBalanceMap =  require('../src/parse-balance-map');

chai.use(solidity);
const overrides = {
    gasLimit: 9999999,
};

/* 
SOLIDITY TASK 1 
Create a merkle distributor contract users can interact with 
to claim their tokens” (with a variable rate per user; 
- user 1 needs to claim 5000 tokens,
- user 2 needs to claim 10000, 
- user 3 needs to claim 100 tokens)
*/

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
describe('MerkleDistributor', () => {
    const amounts = {
        total: { decimal: 15100, hex: '0x3afc' },
        user1: { decimal: 5000,  hex: '0x1388' },
        user2: { decimal: 10000, hex: '0x2710' },
        user3: { decimal: 100,   hex: '0x64'   }
    };

    const provider = new MockProvider({
        ganacheOptions: {
            hardfork: 'istanbul',
            mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
            gasLimit: 9999999,
        },
    });
    const wallets = provider.getWallets();
    const [walletUser1, walletUser2, walletUser3] = wallets;
    let token;
    beforeEach('deploy token', async () => {
        token = await deployContract(walletUser1, TestERC20, ['Evaluation Test Coins', 'ETC', 0], overrides);
    });
    describe('#token', () => {
        it('returns the token address', async () => {
            const distributor = await deployContract(walletUser1, Distributor, [token.address, ZERO_BYTES32], overrides);
            expect(await distributor.token()).to.eq(token.address);
        });
    });
    describe('#merkleRoot', () => {
        it('returns the zero merkle root', async () => {
            const distributor = await deployContract(walletUser1, Distributor, [token.address, ZERO_BYTES32], overrides);
            expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32);
        });
    });
    describe('#claim', () => {
        it('fails when proof is empty', async () => {
            const distributor = await deployContract(walletUser1, Distributor, [token.address, ZERO_BYTES32], overrides);
            await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, [])).to.be.revertedWith('MerkleDistributor: Invalid proof.');
        });
        it('fails for invalid index', async () => {
            const distributor = await deployContract(walletUser1, Distributor, [token.address, ZERO_BYTES32], overrides);
            await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, [])).to.be.revertedWith('MerkleDistributor: Invalid proof.');
        });
        describe('three users tree', () => {
            let distributor;
            let tree;
            beforeEach('deploy', async () => {
                tree = new BalanceTree([
                    { account: walletUser1.address, amount: BigNumber.from(amounts.user1.decimal) },
                    { account: walletUser2.address, amount: BigNumber.from(amounts.user2.decimal) },
                    { account: walletUser3.address, amount: BigNumber.from(amounts.user3.decimal) },
                ]);
                distributor = await deployContract(walletUser1, Distributor, [token.address, tree.getHexRoot()], overrides);
                await token.setBalance(distributor.address, amounts.total.decimal);
            });
            it('successful claim erc20 tokens for the 3 users', async () => {
                // ----------------------------------- User 1 -----------------------------------
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(0, walletUser1.address, amounts.user1.decimal);
                // ----------------------------------- User 2 -----------------------------------
                const proof1 = tree.getProof(1, walletUser2.address, BigNumber.from(amounts.user2.decimal));
                await expect(distributor.claim(1, walletUser2.address, amounts.user2.decimal, proof1, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(1, walletUser2.address, amounts.user2.decimal);
                // ----------------------------------- User 3 -----------------------------------
                const proof2 = tree.getProof(2, walletUser3.address, BigNumber.from(amounts.user3.decimal));
                await expect(distributor.claim(2, walletUser3.address, amounts.user3.decimal, proof2, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(2, walletUser3.address, amounts.user3.decimal);
            });
            it('transfers the token to the requesting account', async () => {
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                // Checks that the balance before is 0
                expect(await token.balanceOf(walletUser1.address)).to.eq(0);
                // Claiming the amount
                await distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides);
                // Checks that the balance after is equal to the claimed amount
                expect(await token.balanceOf(walletUser1.address)).to.eq(amounts.user1.decimal);
            });
            it('must have enough tokens in the smart contract to transfer to the claimer account', async () => {
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                // Reducing the amount of tokens in the smart contract to make it fail
                await token.setBalance(distributor.address, 100);
                await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides)).to.be.
                // The amount in the smart contract at this moment is 100 tokens but the user1 tries to claim 5000 tokens so it reverts the transaction
                revertedWith('ERC20: transfer amount exceeds balance');
            });
            it('sets #isClaimed', async () => {
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                const proof1 = tree.getProof(1, walletUser2.address, BigNumber.from(amounts.user2.decimal));
                // Nothing has been claimed at this moment so is claimed returns false
                expect(await distributor.isClaimed(0)).to.eq(false);
                expect(await distributor.isClaimed(1)).to.eq(false);
                expect(await distributor.isClaimed(2)).to.eq(false);
    
                //Claiming for user 1 and 2, leaving the user 3 to validate that it just marks as claimed only the corresponding ones
                await distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides);
                await distributor.claim(1, walletUser2.address, amounts.user2.decimal, proof1, overrides);
                expect(await distributor.isClaimed(0)).to.eq(true);
                expect(await distributor.isClaimed(1)).to.eq(true);
                expect(await distributor.isClaimed(2)).to.eq(false);
            });
            it('cannot allow two claims for the same account', async () => {
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                await distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides);
                await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof0, overrides)).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
            });
            it('cannot claim more than once with the same account: user 0 and then user 1', async () => {
                // Claiming the first time for user 1
                await distributor.claim(0, walletUser1.address, amounts.user1.decimal, tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal)), overrides);
                // Introducing a valid claim for user 2 in the middle of the doble claim
                await distributor.claim(1, walletUser2.address, amounts.user2.decimal, tree.getProof(1, walletUser2.address, BigNumber.from(amounts.user2.decimal)), overrides);
                // Claiming the second time for user 1
                await expect(distributor.claim(0, walletUser1.address, amounts.user1.decimal, tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal)), overrides)).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
            });
            it('cannot claim more than once switching orders: user 1 and then user 0', async () => {
                // Claiming the first time for user 2
                await distributor.claim(1, walletUser2.address, amounts.user2.decimal, tree.getProof(1, walletUser2.address, BigNumber.from(amounts.user2.decimal)), overrides);
                // Introducing a valid claim for user 1 in the middle of the doble claim
                await distributor.claim(0, walletUser1.address, amounts.user1.decimal, tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal)), overrides);
                // Claiming the first time for user 2
                await expect(distributor.claim(1, walletUser2.address, amounts.user2.decimal, tree.getProof(1, walletUser2.address, BigNumber.from(amounts.user2.decimal)), overrides)).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
            });
            it('cannot claim for address other than proof', async () => {
                // Proof generated for the user 1
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                // Trying to claim tokens for user 2 with the proof of the user 1
                await expect(distributor.claim(1, walletUser2.address, amounts.user2.decimal, proof0, overrides)).to.be.revertedWith('MerkleDistributor: Invalid proof.');
            });
            it('cannot claim more than proof', async () => {
                // Proof generated for a certain amount
                const proof0 = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                // Trying to claim more tokens than allowed in the proof
                const greaterQuantity = amounts.user1.decimal + 1000;
                await expect(distributor.claim(0, walletUser1.address, greaterQuantity, proof0, overrides)).to.be.revertedWith('MerkleDistributor: Invalid proof.');
            });
            it('gas', async () => {
                const proof = tree.getProof(0, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                const tx = await distributor.claim(0, walletUser1.address, amounts.user1.decimal, proof, overrides);
                const receipt = await tx.wait();
                // The gas used should be the same with the same amount of users in the merkle tree
                expect(receipt.gasUsed).to.eq(79305);
            });
        });
        describe('larger tree 10 nodes', () => {
            let distributor;
            let tree;
            beforeEach('deploy', async () => {
                // Creates one leaf per each account found 
                // The basic tests setup has 10 different accounts.
                tree = new BalanceTree(wallets.map((wallet, ix) => {
                    return { account: wallet.address, amount: BigNumber.from(ix + 1) };
                }));
                distributor = await deployContract(walletUser1, Distributor, [token.address, tree.getHexRoot()], overrides);
                // The total of tokens for 10 accounts is 55
                await token.setBalance(distributor.address, 55);
            });
            it('claim index 5', async () => {
                const proof = tree.getProof(5, wallets[5].address, BigNumber.from(6));
                await expect(distributor.claim(5, wallets[5].address, 6, proof, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(5, wallets[5].address, 6);
            });
            it('claim index 8', async () => {
                const proof = tree.getProof(8, wallets[8].address, BigNumber.from(9));
                await expect(distributor.claim(8, wallets[8].address, 9, proof, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(8, wallets[8].address, 9);
            });
            it('gas', async () => {
                const proof = tree.getProof(8, wallets[8].address, BigNumber.from(9));
                const tx = await distributor.claim(8, wallets[8].address, 9, proof, overrides);
                const receipt = await tx.wait();
                expect(receipt.gasUsed).to.eq(80970);
            });
            it('gas second claim', async () => {
                await distributor.claim(0, walletUser1.address, 1, tree.getProof(0, walletUser1.address, BigNumber.from(1)), overrides);
                const tx = await distributor.claim(1, walletUser2.address, 2, tree.getProof(1, walletUser2.address, BigNumber.from(2)), overrides);
                const receipt = await tx.wait();
                expect(receipt.gasUsed).to.eq(65940);
            });
        });
        describe('realistic size tree 100,000 nodes', () => {
            let distributor;
            let tree;
            const NUM_LEAVES = 100000;
            const NUM_SAMPLES = 25;
            const elements = [];
            for (let i = 0; i < NUM_LEAVES; i++) {
                const treeNode = { account: walletUser1.address, amount: BigNumber.from(amounts.user1.decimal) };
                elements.push(treeNode);
            }
            // Gerating a merkle tree with 100,000 leaves
            tree = new BalanceTree(elements);
            it('proof verification works', () => {
                // The proof is correct for all of the leaves
                const root = Buffer.from(tree.getHexRoot().slice(2), 'hex');
                for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
                    const proof = tree
                        .getProof(i, walletUser1.address, BigNumber.from(amounts.user1.decimal))
                        .map((el) => Buffer.from(el.slice(2), 'hex'));
                        // Local verification of the proof without going to the smart contract
                    const validProof = BalanceTree.verifyProof(i, walletUser1.address, BigNumber.from(amounts.user1.decimal), proof, root);
                    expect(validProof).to.be.true;
                }
            });
            beforeEach('deploy', async () => {
                // Deploying a smart contract with the merkle root of the 100.000 leaves
                distributor = await deployContract(walletUser1, Distributor, [token.address, tree.getHexRoot()], overrides);
                // Asigning enough amount of erc20s to the smart contract
                await token.setBalance(distributor.address, constants.MaxUint256);
            });
            it('gas spent in leaf #50,000', async () => {
                // Claim tokens for leaf #50000
                const proof = tree.getProof(50000, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                const tx = await distributor.claim(50000, walletUser1.address, amounts.user1.decimal, proof, overrides);
                const receipt = await tx.wait();
                expect(receipt.gasUsed).to.eq(91590);
            });
            it('gas deeper in depper leaf #90,000', async () => {
                // Claim tokens for leaf #90000
                const proof = tree.getProof(90000, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                const tx = await distributor.claim(90000, walletUser1.address, amounts.user1.decimal, proof, overrides);
                const receipt = await tx.wait();
                expect(receipt.gasUsed).to.eq(91642);
            });
            it('gas average random distribution', async () => {
                // Calculates the average gas used based on a number of samples
                let total = BigNumber.from(0);
                let count = 0;
                for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
                    const proof = tree.getProof(i, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                    const tx = await distributor.claim(i, walletUser1.address, amounts.user1.decimal, proof, overrides);
                    const receipt = await tx.wait();
                    total = total.add(receipt.gasUsed);
                    count++;
                }
                const average = total.div(count);
                expect(average).to.eq(77118);
            });
            it('gas average first 25 nodes', async () => {
                let total = BigNumber.from(0);
                let count = 0;
                for (let i = 0; i < 25; i++) {
                    const proof = tree.getProof(i, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                    const tx = await distributor.claim(i, walletUser1.address, amounts.user1.decimal, proof, overrides);
                    const receipt = await tx.wait();
                    total = total.add(receipt.gasUsed);
                    count++;
                }
                const average = total.div(count);
                expect(average).to.eq(62837);
            });
            it('no double claims in random distribution', async () => {
                for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
                    const proof = tree.getProof(i, walletUser1.address, BigNumber.from(amounts.user1.decimal));
                    await distributor.claim(i, walletUser1.address, amounts.user1.decimal, proof, overrides);
                    await expect(distributor.claim(i, walletUser1.address, amounts.user1.decimal, proof, overrides)).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
                }
            });
        });
    });
    describe('parseBalanceMap', () => {
        let distributor;
        let claims;
        beforeEach('deploy', async () => {
            const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
                [walletUser1.address]: amounts.user1.decimal,
                [walletUser2.address]: amounts.user2.decimal,
                [walletUser3.address]: amounts.user3.decimal,
            });
            expect(tokenTotal).to.eq(amounts.total.hex); // 15100
            claims = innerClaims;
            distributor = await deployContract(walletUser1, Distributor, [token.address, merkleRoot], overrides);
            await token.setBalance(distributor.address, tokenTotal);
        });
        it('check the proofs is as expected for the 3 users', () => {
            // These is validating the format of the proof for the 3 users
            expect(claims).to.deep.eq({
                [walletUser1.address]: {
                    index: 0,
                    amount: amounts.user1.hex,
                    proof: [
                        '0x69676dbd92be8130a3ca69b2d734789d6a1ac70efef3278b495e07552545178b',
                        '0xeec03e08ad36e8b5ce8d11a48a7f0e8138497f4e8b81ae62aef3ce91d668d679'
                    ],
                },
                [walletUser2.address]: {
                    index: 1,
                    amount: amounts.user2.hex,
                    proof: ['0xbad736e7df96f5480b0df70ed70e6f8edb85bc75789f1249fb91643671a5d6aa'],
                },
                [wallets[2].address]: {
                    index: 2,
                    amount: amounts.user3.hex,
                    proof: [
                        '0xc276cc90ce450092e188f37507b34145896b886aae5f1ea3328159622e202b56',
                        '0xeec03e08ad36e8b5ce8d11a48a7f0e8138497f4e8b81ae62aef3ce91d668d679',
                    ],
                },
            });
        });
        it('all claims work exactly once', async () => {
            // Validates that the 3 users can claim their tokens just a single time
            for (let account in claims) {
                const claim = claims[account];
                await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(claim.index, account, claim.amount);
                await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides)).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
            }
            expect(await token.balanceOf(distributor.address)).to.eq(0);
        });
    });
});